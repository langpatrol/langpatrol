/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Report } from '../types';
import { VERBOSE_PATTERNS, CONCISE_PATTERNS, JSON_ONLY_PATTERNS, EXPLANATORY_PATTERNS } from '@langpatrol/rules';
import { extractText } from '../util/text';
import { createIssueId, createPreview } from '../util/reporting';
import { computeSemanticSimilarity, isSemanticSimilarityAvailable } from '../util/semanticSimilarity';
import { checkEntailment, isNLIEntailmentAvailable } from '../util/nliEntailment';

interface ConflictMatch {
  text: string;
  start: number;
  end: number;
  context?: string; // surrounding context for better detection
}

interface ConflictPair {
  bucket: 'verbosity' | 'format' | 'semantic' | 'logical';
  a: ConflictMatch;
  b: ConflictMatch;
  confidence: number;
  method: 'pattern' | 'semantic' | 'nli' | 'combined';
}

// Semantic conflict patterns - opposite concepts
const VERBOSITY_OPPOSITES = [
  { concise: ['concise', 'brief', 'short', 'minimal', 'succinct', 'terse', 'compact'],
    verbose: ['detailed', 'comprehensive', 'step by step', 'exhaustive', 'thorough', 'elaborate', 'extensive'] },
  { concise: ['quick', 'fast', 'rapid'],
    verbose: ['slow', 'careful', 'methodical'] }
];

const FORMAT_OPPOSITES = [
  { strict: ['json only', 'strict json', 'valid json', 'json format', 'no text'],
    flexible: ['explain', 'commentary', 'notes', 'discussion', 'describe', 'elaborate', 'add context'] }
];

function findOccurrences(pattern: RegExp, text: string): ConflictMatch[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const results: ConflictMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    // Extract context (50 chars before and after)
    const contextStart = Math.max(0, start - 50);
    const contextEnd = Math.min(text.length, end + 50);
    const context = text.substring(contextStart, contextEnd);
    results.push({ text: match[0], start, end, context });
  }
  return results;
}

/**
 * Extract sentences or phrases containing potential conflict keywords
 */
function extractConflictPhrases(text: string, keywords: string[]): ConflictMatch[] {
  const results: ConflictMatch[] = [];
  const sentences = text.split(/[.!?]\s+/);
  
  for (const sentence of sentences) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const match = regex.exec(sentence);
      if (match) {
        const sentenceStart = text.indexOf(sentence);
        if (sentenceStart >= 0) {
          const start = sentenceStart + (match.index || 0);
          const end = start + match[0].length;
          results.push({
            text: match[0],
            start,
            end,
            context: sentence.trim()
          });
        }
      }
    }
  }
  
  return results;
}

/**
 * Check if two texts are semantically opposite using embeddings
 */
async function checkSemanticConflict(
  text1: string,
  text2: string,
  threshold: number = 0.3
): Promise<{ isConflict: boolean; similarity: number }> {
  try {
    const similarity = await computeSemanticSimilarity(text1, text2);
    if (similarity === null) {
      return { isConflict: false, similarity: 0 };
    }
    
    // Low similarity between opposite concepts indicates a conflict
    // For example, "concise" and "detailed" should have low similarity
    const isConflict = similarity < threshold;
    return { isConflict, similarity };
  } catch (error) {
    console.error('[Conflicts] Error checking semantic conflict:', error);
    return { isConflict: false, similarity: 0 };
  }
}

/**
 * Check if two instructions logically contradict using NLI
 */
async function checkLogicalContradiction(
  instruction1: string,
  instruction2: string,
  threshold: number = 0.7
): Promise<{ isContradiction: boolean; score: number }> {
  try {
    // Use NLI to check if instruction1 contradicts instruction2
    // We check both directions for better accuracy
    const [score1, score2] = await Promise.all([
      checkEntailment(instruction1, `This contradicts: ${instruction2}`),
      checkEntailment(instruction2, `This contradicts: ${instruction1}`)
    ]);
    
    // If either direction shows high contradiction, it's a conflict
    const maxScore = Math.max(score1 || 0, score2 || 0);
    const isContradiction = maxScore > threshold;
    
    return { isContradiction, score: maxScore };
  } catch (error) {
    console.error('[Conflicts] Error checking logical contradiction:', error);
    return { isContradiction: false, score: 0 };
  }
}

/**
 * Synchronous version using pattern matching only
 */
export function run(input: AnalyzeInput, acc: Report): void {
  const text = extractText(input);
  if (!text) return;

  const scope = input.messages && input.messages.length > 0
    ? { type: 'messages' as const, messageIndex: input.messages.length - 1 }
    : { type: 'prompt' as const };

  const verboseMatches = findOccurrences(VERBOSE_PATTERNS, text);
  const conciseMatches = findOccurrences(CONCISE_PATTERNS, text);
  const jsonOnlyMatches = findOccurrences(JSON_ONLY_PATTERNS, text);
  const explanatoryMatches = findOccurrences(EXPLANATORY_PATTERNS, text);

  const conflicts: ConflictPair[] = [];

  if (verboseMatches.length > 0 && conciseMatches.length > 0) {
    conflicts.push({
      bucket: 'verbosity',
      a: verboseMatches[0],
      b: conciseMatches[0],
      confidence: 1.0,
      method: 'pattern'
    });
  }

  if (jsonOnlyMatches.length > 0 && explanatoryMatches.length > 0) {
    conflicts.push({
      bucket: 'format',
      a: jsonOnlyMatches[0],
      b: explanatoryMatches[0],
      confidence: 1.0,
      method: 'pattern'
    });
  }

  if (conflicts.length === 0) return;

  reportConflicts(conflicts, acc, scope, text);
}

/**
 * Async version with semantic similarity and NLI entailment
 */
export async function runAsync(input: AnalyzeInput, acc: Report): Promise<void> {
  const text = extractText(input);
  if (!text) return;

  const scope = input.messages && input.messages.length > 0
    ? { type: 'messages' as const, messageIndex: input.messages.length - 1 }
    : { type: 'prompt' as const };

  const useSemantic = input.options?.useSemanticConflictDetection === true && isSemanticSimilarityAvailable();
  const useNLI = input.options?.useNLIConflictDetection === true && isNLIEntailmentAvailable();
  
  // If no semantic features enabled, use sync version
  if (!useSemantic && !useNLI) {
    run(input, acc);
    return;
  }

  const conflicts: ConflictPair[] = [];
  const similarityThreshold = input.options?.conflictSimilarityThreshold ?? 0.3;
  const contradictionThreshold = input.options?.conflictContradictionThreshold ?? 0.7;

  // 1. Pattern-based detection (fast, always run)
  const verboseMatches = findOccurrences(VERBOSE_PATTERNS, text);
  const conciseMatches = findOccurrences(CONCISE_PATTERNS, text);
  const jsonOnlyMatches = findOccurrences(JSON_ONLY_PATTERNS, text);
  const explanatoryMatches = findOccurrences(EXPLANATORY_PATTERNS, text);

  if (verboseMatches.length > 0 && conciseMatches.length > 0) {
    conflicts.push({
      bucket: 'verbosity',
      a: verboseMatches[0],
      b: conciseMatches[0],
      confidence: 1.0,
      method: 'pattern'
    });
  }

  if (jsonOnlyMatches.length > 0 && explanatoryMatches.length > 0) {
    conflicts.push({
      bucket: 'format',
      a: jsonOnlyMatches[0],
      b: explanatoryMatches[0],
      confidence: 1.0,
      method: 'pattern'
    });
  }

  // 2. Semantic similarity detection (detects paraphrased conflicts)
  if (useSemantic) {
    console.log('[Conflicts] Running semantic conflict detection...');
    
    // Check verbosity opposites
    for (const oppositeSet of VERBOSITY_OPPOSITES) {
      const concisePhrases = extractConflictPhrases(text, oppositeSet.concise);
      const verbosePhrases = extractConflictPhrases(text, oppositeSet.verbose);
      
      for (const concise of concisePhrases) {
        for (const verbose of verbosePhrases) {
          const { isConflict, similarity } = await checkSemanticConflict(
            concise.context || concise.text,
            verbose.context || verbose.text,
            similarityThreshold
          );
          
          if (isConflict) {
            conflicts.push({
              bucket: 'verbosity',
              a: concise,
              b: verbose,
              confidence: 1 - similarity, // Lower similarity = higher confidence in conflict
              method: 'semantic'
            });
          }
        }
      }
    }
    
    // Check format opposites
    for (const oppositeSet of FORMAT_OPPOSITES) {
      const strictPhrases = extractConflictPhrases(text, oppositeSet.strict);
      const flexiblePhrases = extractConflictPhrases(text, oppositeSet.flexible);
      
      for (const strict of strictPhrases) {
        for (const flexible of flexiblePhrases) {
          const { isConflict, similarity } = await checkSemanticConflict(
            strict.context || strict.text,
            flexible.context || flexible.text,
            similarityThreshold
          );
          
          if (isConflict) {
            conflicts.push({
              bucket: 'format',
              a: strict,
              b: flexible,
              confidence: 1 - similarity,
              method: 'semantic'
            });
          }
        }
      }
    }
  }

  // 3. NLI contradiction detection (logical validation)
  if (useNLI) {
    console.log('[Conflicts] Running NLI contradiction detection...');
    
    // Check all pairs of instructions for logical contradictions
    const allPhrases: ConflictMatch[] = [
      ...verboseMatches,
      ...conciseMatches,
      ...jsonOnlyMatches,
      ...explanatoryMatches
    ];
    
    // Also extract semantic phrases if available
    if (useSemantic) {
      for (const oppositeSet of VERBOSITY_OPPOSITES) {
        const allKeywords = [
          ...oppositeSet.concise,
          ...oppositeSet.verbose
        ];
        const phrases = extractConflictPhrases(text, allKeywords);
        allPhrases.push(...phrases);
      }
      for (const oppositeSet of FORMAT_OPPOSITES) {
        const allKeywords = [
          ...oppositeSet.strict,
          ...oppositeSet.flexible
        ];
        const phrases = extractConflictPhrases(text, allKeywords);
        allPhrases.push(...phrases);
      }
    }
    
    // Check pairs for contradictions
    for (let i = 0; i < allPhrases.length; i++) {
      for (let j = i + 1; j < allPhrases.length; j++) {
        const phrase1 = allPhrases[i];
        const phrase2 = allPhrases[j];
        
        const { isContradiction, score } = await checkLogicalContradiction(
          phrase1.context || phrase1.text,
          phrase2.context || phrase2.text,
          contradictionThreshold
        );
        
        if (isContradiction) {
          // Determine bucket based on content
          let bucket: 'verbosity' | 'format' | 'semantic' | 'logical' = 'logical';
          const text1 = phrase1.text.toLowerCase();
          const text2 = phrase2.text.toLowerCase();
          
          if ((VERBOSE_PATTERNS.test(text1) || VERBOSE_PATTERNS.test(text2)) &&
              (CONCISE_PATTERNS.test(text1) || CONCISE_PATTERNS.test(text2))) {
            bucket = 'verbosity';
          } else if ((JSON_ONLY_PATTERNS.test(text1) || JSON_ONLY_PATTERNS.test(text2)) &&
                     (EXPLANATORY_PATTERNS.test(text1) || EXPLANATORY_PATTERNS.test(text2))) {
            bucket = 'format';
          }
          
          conflicts.push({
            bucket,
            a: phrase1,
            b: phrase2,
            confidence: score,
            method: 'nli'
          });
        }
      }
    }
  }

  // Remove duplicates (same conflict detected by multiple methods)
  const uniqueConflicts = deduplicateConflicts(conflicts);

  if (uniqueConflicts.length === 0) return;

  reportConflicts(uniqueConflicts, acc, scope, text);
}

/**
 * Remove duplicate conflicts (same pair detected by different methods)
 */
function deduplicateConflicts(conflicts: ConflictPair[]): ConflictPair[] {
  const seen = new Set<string>();
  const unique: ConflictPair[] = [];
  
  for (const conflict of conflicts) {
    // Create a key based on positions
    const key = `${conflict.bucket}:${Math.min(conflict.a.start, conflict.b.start)}:${Math.max(conflict.a.end, conflict.b.end)}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(conflict);
    } else {
      // If duplicate found, keep the one with higher confidence
      const existing = unique.find(c => 
        `${c.bucket}:${Math.min(c.a.start, c.b.start)}:${Math.max(c.a.end, c.b.end)}` === key
      );
      if (existing && conflict.confidence > existing.confidence) {
        const index = unique.indexOf(existing);
        unique[index] = conflict;
      }
    }
  }
  
  return unique;
}

/**
 * Report conflicts to the report
 */
function reportConflicts(
  conflicts: ConflictPair[],
  acc: Report,
  scope: { type: 'prompt' | 'messages'; messageIndex?: number },
  text: string
): void {
  const issueId = createIssueId();

  const summaryMap = new Map<string, number>();
  for (const conflict of conflicts) {
    summaryMap.set(conflict.bucket, (summaryMap.get(conflict.bucket) || 0) + 1);
  }
  const summary = Array.from(summaryMap.entries()).map(([text, count]) => ({ text, count }));

  const occurrences = conflicts.map((conflict) => ({
    text: conflict.a.text,
    start: conflict.a.start,
    end: conflict.a.end,
    bucket: conflict.bucket,
    confidence: conflict.confidence,
    method: conflict.method,
    preview: createPreview(text, conflict.a.start, conflict.a.end),
    pairedWith: {
      text: conflict.b.text,
      start: conflict.b.start,
      end: conflict.b.end,
      preview: createPreview(text, conflict.b.start, conflict.b.end)
    }
  }));

  const detailParts: string[] = [];
  if (conflicts.some((c) => c.bucket === 'verbosity')) {
    detailParts.push("concise vs step by step");
  }
  if (conflicts.some((c) => c.bucket === 'format')) {
    detailParts.push('JSON only vs commentary');
  }
  if (conflicts.some((c) => c.bucket === 'semantic')) {
    detailParts.push('semantically conflicting instructions');
  }
  if (conflicts.some((c) => c.bucket === 'logical')) {
    detailParts.push('logically contradictory instructions');
  }

  const detail = `Conflicting directives: ${detailParts.join('; ')}.`;

  const avgConfidence = conflicts.length > 0 
    ? conflicts.reduce((sum, c) => sum + c.confidence, 0) / conflicts.length 
    : 0;

  acc.issues.push({
    id: issueId,
    code: 'CONFLICTING_INSTRUCTION',
    severity: 'medium',
    detail,
    evidence: {
      summary,
      occurrences
    },
    scope,
    confidence: avgConfidence > 0.7 ? 'high' : 'medium'
  });

  acc.suggestions = acc.suggestions || [];
  if (conflicts.some((c) => c.bucket === 'verbosity')) {
    acc.suggestions.push({
      type: 'TIGHTEN_INSTRUCTION',
      text: 'Remove either the "concise" or "step-by-step" directive to avoid contradictions.',
      for: issueId
    });
  }
  if (conflicts.some((c) => c.bucket === 'format')) {
    acc.suggestions.push({
      type: 'ENFORCE_JSON',
      text: 'If strict JSON is required, drop commentary instructions or move them into schema metadata.',
      for: issueId
    });
  }
  if (conflicts.some((c) => c.bucket === 'semantic' || c.bucket === 'logical')) {
    acc.suggestions.push({
      type: 'TIGHTEN_INSTRUCTION',
      text: 'Review and align conflicting instructions detected by semantic analysis.',
      for: issueId
    });
  }
}
