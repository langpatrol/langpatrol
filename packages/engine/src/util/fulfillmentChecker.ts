/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { computeSemanticSimilarity, isSemanticSimilarityAvailable } from './semanticSimilarity';
import { checkEntailment, isNLIEntailmentAvailable } from './nliEntailment';
import { normalizeNoun, normalizePhrase } from './normalize';

/**
 * Split text into overlapping chunks for better context-aware matching
 */
function splitIntoChunks(text: string, chunkSize: number = 500, overlap: number = 100): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }
  
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Extract sentences from text for sentence-level matching
 */
function extractSentences(text: string): string[] {
  // Split by sentence boundaries (., !, ? followed by whitespace or end)
  return text
    .split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Filter very short fragments
}

/**
 * Extract key phrases from text that might be relevant for matching
 */
function extractKeyPhrases(text: string, maxPhrases: number = 10): string[] {
  const phrases: string[] = [];
  
  // Extract "the X" phrases
  const thePhrases = [...text.matchAll(/\bthe\s+([a-z][a-z0-9_\s-]{2,20})\b/gi)];
  thePhrases.forEach(m => {
    if (m[0].length > 5 && m[0].length < 50) {
      phrases.push(m[0]);
    }
  });
  
  // Extract "X above/below/earlier" phrases
  const deicticPhrases = [...text.matchAll(/\b([a-z][a-z0-9_\s-]{2,20})\s+(above|below|earlier|previously|aforementioned|mentioned)\b/gi)];
  deicticPhrases.forEach(m => {
    if (m[0].length > 5 && m[0].length < 50) {
      phrases.push(m[0]);
    }
  });
  
  // Remove duplicates and return
  return [...new Set(phrases)].slice(0, maxPhrases);
}

/**
 * Build multiple NLI hypotheses for better entailment checking
 */
function buildNLIHypotheses(reference: string): string[] {
  const normalizedRef = normalizePhrase(reference);
  
  // Extract head noun from reference
  const nounMatch = normalizedRef.match(/\b(the|this|that|these|those|aforementioned)\s+([a-z][a-z0-9_-]{2,})\b/);
  const headNoun = nounMatch ? nounMatch[2] : normalizedRef.split(/\s+/).pop() || normalizedRef;
  
  // Build multiple hypotheses
  return [
    `There is ${headNoun}`,
    `The ${headNoun} was mentioned`,
    `A ${headNoun} exists`,
    `The context refers to ${headNoun}`,
    `There exists ${normalizedRef}`
  ];
}

/**
 * Compute semantic similarity with chunked context matching
 * Compares reference against multiple chunks and returns the best match
 */
async function computeSemanticSimilarityChunked(
  reference: string,
  searchText: string,
  chunkSize: number = 500,
  overlap: number = 100
): Promise<number | null> {
  const chunks = splitIntoChunks(searchText, chunkSize, overlap);
  const scores: number[] = [];
  
  // Compare reference against each chunk
  for (const chunk of chunks) {
    const similarity = await computeSemanticSimilarity(reference, chunk);
    if (similarity !== null) {
      scores.push(similarity);
    }
  }
  
  // Return the highest score (best match)
  return scores.length > 0 ? Math.max(...scores) : null;
}

/**
 * Compute semantic similarity with sentence-level matching
 */
async function computeSemanticSimilaritySentenceLevel(
  reference: string,
  searchText: string
): Promise<number | null> {
  const sentences = extractSentences(searchText);
  if (sentences.length === 0) {
    // Fall back to full text if no sentences found
    return computeSemanticSimilarity(reference, searchText);
  }
  
  const scores: number[] = [];
  
  // Compare against each sentence
  for (const sentence of sentences) {
    const similarity = await computeSemanticSimilarity(reference, sentence);
    if (similarity !== null) {
      scores.push(similarity);
    }
  }
  
  // Return the highest score
  return scores.length > 0 ? Math.max(...scores) : null;
}

/**
 * Compute semantic similarity with phrase-level matching
 */
async function computeSemanticSimilarityPhraseLevel(
  reference: string,
  searchText: string,
  maxPhrases: number = 10
): Promise<number | null> {
  const phrases = extractKeyPhrases(searchText, maxPhrases);
  if (phrases.length === 0) {
    // Fall back to full text if no phrases found
    return computeSemanticSimilarity(reference, searchText);
  }
  
  const scores: number[] = [];
  
  // Compare against each phrase
  for (const phrase of phrases) {
    const similarity = await computeSemanticSimilarity(reference, phrase);
    if (similarity !== null) {
      scores.push(similarity);
    }
  }
  
  // Return the highest score
  return scores.length > 0 ? Math.max(...scores) : null;
}

/**
 * Check entailment with multiple hypotheses and return the best score
 */
async function checkEntailmentMultiHypothesis(
  premise: string,
  reference: string
): Promise<number | null> {
  const hypotheses = buildNLIHypotheses(reference);
  const scores: number[] = [];
  
  // Check each hypothesis
  for (const hypothesis of hypotheses) {
    const score = await checkEntailment(premise, hypothesis);
    if (score !== null) {
      scores.push(score);
    }
  }
  
  // Return the highest score (best match)
  return scores.length > 0 ? Math.max(...scores) : null;
}

export type FulfillmentStatus = 
  | 'fulfilled' 
  | 'unfulfilled' 
  | 'uncertain';

export type FulfillmentResult = {
  status: FulfillmentStatus;
  method: 'pattern' | 'semantic-similarity' | 'nli-entailment' | 'combined' | 'none';
  confidence: number; // 0-1
  details?: {
    patternScore?: number;
    similarityScore?: number;
    entailmentScore?: number;
    combinedScore?: number;
    matchedText?: string;
  };
};

/**
 * Synchronous pattern-based fulfillment check (Step 1 of hierarchical checking)
 * This is the base pattern matching that always runs first.
 */
export function checkFulfillmentPattern(
  reference: string,
  searchText: string,
  effectiveNouns: Set<string>,
  effectiveSynonyms: Record<string, Set<string>>
): FulfillmentResult {
  const normalizedRef = normalizePhrase(reference);
  const normalizedSearch = normalizePhrase(searchText);
  const refLower = normalizedRef.toLowerCase();
  const searchLower = normalizedSearch.toLowerCase();
  
  // Extract head noun from reference (e.g., "the report" -> "report")
  const nounMatch = refLower.match(/\b(the|this|that|these|those|aforementioned)\s+([a-z][a-z0-9_-]{2,})\b/);
  const headNoun = nounMatch ? normalizeNoun(nounMatch[2]) : refLower.split(/\s+/).pop() || refLower;
  
  // Check for exact match
  const exactPattern = new RegExp(`\\b${headNoun}s?\\b`, 'i');
  if (exactPattern.test(searchLower)) {
    return {
      status: 'fulfilled',
      method: 'pattern',
      confidence: 0.9,
      details: { matchedText: headNoun }
    };
  }
  
  // Check synonyms
  const synonyms = effectiveSynonyms[headNoun] || new Set([headNoun]);
  for (const syn of synonyms) {
    const synPattern = new RegExp(`\\b${syn}s?\\b`, 'i');
    if (synPattern.test(searchLower)) {
      return {
        status: 'fulfilled',
        method: 'pattern',
        confidence: 0.8,
        details: { matchedText: syn }
      };
    }
  }
  
  return {
    status: 'unfulfilled',
    method: 'pattern',
    confidence: 0.0
  };
}

/**
 * Hierarchical fulfillment checker: pattern → semantic similarity → NLI entailment
 * 
 * Checks if a reference (e.g., "the report") is fulfilled by content in the search text.
 * Uses a hierarchical approach:
 * 1. Pattern matching (exact/synonym) - synchronous
 * 2. Semantic similarity (if available) - async
 * 3. NLI entailment (if available) - async
 */
export async function checkFulfillment(
  reference: string, // e.g., "the report"
  searchText: string, // text to search in (history or future content)
  effectiveNouns: Set<string>,
  effectiveSynonyms: Record<string, Set<string>>,
  options?: {
    similarityThreshold?: number; // default 0.6
    entailmentThreshold?: number; // default 0.7
    useSemanticSimilarity?: boolean;
    useNLIEntailment?: boolean;
    usePatternMatching?: boolean; // default true
  }
): Promise<FulfillmentResult> {
  const similarityThreshold = options?.similarityThreshold ?? 0.6;
  const entailmentThreshold = options?.entailmentThreshold ?? 0.7;
  const useSemanticSimilarity = options?.useSemanticSimilarity ?? true;
  const useNLIEntailment = options?.useNLIEntailment ?? true;
  const usePatternMatching = options?.usePatternMatching ?? true;

  console.log('[FulfillmentChecker] checkFulfillment called for:', reference.substring(0, 50));
  console.log('[FulfillmentChecker] Options:', { similarityThreshold, entailmentThreshold, useSemanticSimilarity, useNLIEntailment, usePatternMatching });

  // Step 1: Pattern matching (only if enabled)
  if (usePatternMatching) {
    const patternResult = checkFulfillmentPattern(reference, searchText, effectiveNouns, effectiveSynonyms);
    console.log('[FulfillmentChecker] Pattern result:', patternResult.status, 'confidence:', patternResult.confidence);
    if (patternResult.status === 'fulfilled') {
      console.log('[FulfillmentChecker] Pattern matched, returning early');
      return patternResult;
    }
  } else {
    console.log('[FulfillmentChecker] Pattern matching disabled, skipping');
  }

  const normalizedRef = normalizePhrase(reference);
  const normalizedSearch = normalizePhrase(searchText);

  // Step 2: Semantic similarity (if available and enabled)
  if (useSemanticSimilarity && isSemanticSimilarityAvailable()) {
    try {
      const similarity = await computeSemanticSimilarity(normalizedRef, normalizedSearch);
      if (similarity !== null && similarity >= similarityThreshold) {
        return {
          status: 'fulfilled',
          method: 'semantic-similarity',
          confidence: similarity,
          details: { similarityScore: similarity }
        };
      }
      // If similarity is available but below threshold, continue to NLI
    } catch (error) {
      // Fall through to NLI if semantic similarity fails
    }
  }

  // Step 3: NLI entailment (if available and enabled)
  if (useNLIEntailment && isNLIEntailmentAvailable()) {
    try {
      // Construct premise and hypothesis for NLI
      // Premise: the search text (what we have)
      // Hypothesis: the reference (what we're looking for)
      const premise = normalizedSearch;
      const hypothesis = `There is ${normalizedRef}`;
      
      const entailmentScore = await checkEntailment(premise, hypothesis);
      if (entailmentScore !== null && entailmentScore >= entailmentThreshold) {
        return {
          status: 'fulfilled',
          method: 'nli-entailment',
          confidence: entailmentScore,
          details: { entailmentScore }
        };
      }
    } catch (error) {
      // Fall through to unfulfilled if NLI fails
    }
  }

  // No fulfillment found
  return {
    status: 'unfulfilled',
    method: 'none',
    confidence: 0.0
  };
}

/**
 * Combined fulfillment checker: runs all methods and combines scores
 * 
 * This approach runs pattern matching, semantic similarity, and NLI entailment
 * in parallel and combines their scores with configurable weights.
 * 
 * Weights (default):
 * - Pattern: 0.4 (fast, reliable for exact matches)
 * - Semantic Similarity: 0.3 (catches paraphrases)
 * - NLI Entailment: 0.3 (checks logical relationships)
 */
export async function checkFulfillmentCombined(
  reference: string,
  searchText: string,
  effectiveNouns: Set<string>,
  effectiveSynonyms: Record<string, Set<string>>,
  options?: {
    similarityThreshold?: number;
    entailmentThreshold?: number;
    useSemanticSimilarity?: boolean;
    useNLIEntailment?: boolean;
    usePatternMatching?: boolean; // default true
    combineWeights?: {
      pattern?: number;
      semantic?: number;
      nli?: number;
    };
    combinedThreshold?: number; // default 0.5
    // Context-aware matching options
    useChunkedMatching?: boolean; // Use chunked matching for long contexts
    chunkSize?: number; // Size of each chunk (default: 500)
    chunkOverlap?: number; // Overlap between chunks (default: 100)
    useSentenceLevel?: boolean; // Use sentence-level matching
    usePhraseLevel?: boolean; // Use phrase-level matching
    useMultiHypothesis?: boolean; // Use multiple NLI hypotheses
  }
): Promise<FulfillmentResult> {
  const similarityThreshold = options?.similarityThreshold ?? 0.6;
  const entailmentThreshold = options?.entailmentThreshold ?? 0.7;
  const useSemanticSimilarity = options?.useSemanticSimilarity ?? true;
  const useNLIEntailment = options?.useNLIEntailment ?? true;
  const usePatternMatching = options?.usePatternMatching ?? true;
  const combinedThreshold = options?.combinedThreshold ?? 0.5;
  
  // Normalize texts early for context-aware matching decisions
  const normalizedRef = normalizePhrase(reference);
  const normalizedSearch = normalizePhrase(searchText);
  
  // Context-aware matching options
  const useChunkedMatching = options?.useChunkedMatching ?? (normalizedSearch.length > 1000); // Auto-enable for long texts
  const chunkSize = options?.chunkSize ?? 500;
  const chunkOverlap = options?.chunkOverlap ?? 100;
  const useSentenceLevel = options?.useSentenceLevel ?? false;
  const usePhraseLevel = options?.usePhraseLevel ?? false;
  const useMultiHypothesis = options?.useMultiHypothesis ?? true;
  
  console.log('[FulfillmentChecker] checkFulfillmentCombined called for:', reference.substring(0, 50));
  console.log('[FulfillmentChecker] Combined options:', { 
    similarityThreshold, 
    entailmentThreshold, 
    useSemanticSimilarity, 
    useNLIEntailment, 
    combinedThreshold,
    useChunkedMatching,
    useSentenceLevel,
    usePhraseLevel,
    useMultiHypothesis
  });
  
  // Default weights (pattern weight is 0 if pattern matching is disabled)
  const weights = {
    pattern: usePatternMatching ? (options?.combineWeights?.pattern ?? 0.4) : 0,
    semantic: options?.combineWeights?.semantic ?? 0.3,
    nli: options?.combineWeights?.nli ?? 0.3
  };
  
  // Normalize weights (handle case where pattern is disabled)
  const totalWeight = weights.pattern + weights.semantic + weights.nli;
  const normalizedWeights = {
    pattern: totalWeight > 0 ? weights.pattern / totalWeight : 0,
    semantic: totalWeight > 0 ? weights.semantic / totalWeight : (weights.semantic / (weights.semantic + weights.nli)),
    nli: totalWeight > 0 ? weights.nli / totalWeight : (weights.nli / (weights.semantic + weights.nli))
  };

  const scores = {
    pattern: 0.0,
    semantic: 0.0,
    nli: 0.0
  };

  // Step 1: Pattern matching (only if enabled)
  let patternResult: FulfillmentResult | undefined;
  if (usePatternMatching) {
    patternResult = checkFulfillmentPattern(reference, searchText, effectiveNouns, effectiveSynonyms);
    scores.pattern = patternResult.confidence;
  } else {
    console.log('[FulfillmentChecker] Pattern matching disabled in combined scoring');
  }
  
  console.log('[FulfillmentChecker] Normalized reference:', normalizedRef.substring(0, 100), 'length:', normalizedRef.length);
  console.log('[FulfillmentChecker] Normalized search:', normalizedSearch.substring(0, 100), 'length:', normalizedSearch.length);
  console.log('[FulfillmentChecker] Original reference:', reference.substring(0, 100));
  console.log('[FulfillmentChecker] Original searchText:', searchText.substring(0, 100), 'length:', searchText.length);

  // Step 2 & 3: Run semantic similarity and NLI in parallel (if enabled)
  const promises: Promise<void>[] = [];

  if (useSemanticSimilarity && isSemanticSimilarityAvailable()) {
    promises.push(
      (async () => {
        try {
          let similarity: number | null = null;
          
          // Choose matching strategy based on options
          if (usePhraseLevel) {
            // Phrase-level matching (most precise)
            similarity = await computeSemanticSimilarityPhraseLevel(normalizedRef, normalizedSearch);
            console.log('[FulfillmentChecker] Phrase-level similarity:', similarity);
          } else if (useSentenceLevel) {
            // Sentence-level matching (balanced)
            similarity = await computeSemanticSimilaritySentenceLevel(normalizedRef, normalizedSearch);
            console.log('[FulfillmentChecker] Sentence-level similarity:', similarity);
          } else if (useChunkedMatching) {
            // Chunked matching (for long contexts)
            similarity = await computeSemanticSimilarityChunked(normalizedRef, normalizedSearch, chunkSize, chunkOverlap);
            console.log('[FulfillmentChecker] Chunked similarity:', similarity);
          } else {
            // Full-text comparison (original method)
            similarity = await computeSemanticSimilarity(normalizedRef, normalizedSearch);
            console.log('[FulfillmentChecker] Full-text similarity:', similarity);
          }
          
          if (similarity !== null) {
            scores.semantic = similarity;
          }
        } catch (error) {
          console.error('[FulfillmentChecker] Error in semantic similarity:', error);
          // Keep score at 0.0 if it fails
        }
      })()
    );
  }

  if (useNLIEntailment && isNLIEntailmentAvailable()) {
    promises.push(
      (async () => {
        try {
          const premise = normalizedSearch;
          let entailmentScore: number | null = null;
          
          if (useMultiHypothesis) {
            // Use multiple hypotheses for better matching
            entailmentScore = await checkEntailmentMultiHypothesis(premise, normalizedRef);
            console.log('[FulfillmentChecker] Multi-hypothesis NLI score:', entailmentScore);
          } else {
            // Single hypothesis (original method)
            const hypothesis = `There is ${normalizedRef}`;
            entailmentScore = await checkEntailment(premise, hypothesis);
            console.log('[FulfillmentChecker] Single-hypothesis NLI score:', entailmentScore);
          }
          
          if (entailmentScore !== null) {
            scores.nli = entailmentScore;
          }
        } catch (error) {
          console.error('[FulfillmentChecker] Error in NLI entailment:', error);
          // Keep score at 0.0 if it fails
        }
      })()
    );
  }

  // Wait for all async operations to complete
  await Promise.all(promises);

  console.log('[FulfillmentChecker] Combined scores:', { pattern: scores.pattern, semantic: scores.semantic, nli: scores.nli });
  console.log('[FulfillmentChecker] Weights:', normalizedWeights);

  // Calculate weighted combined score
  const combinedScore = 
    (scores.pattern * normalizedWeights.pattern) +
    (scores.semantic * normalizedWeights.semantic) +
    (scores.nli * normalizedWeights.nli);
  
  console.log('[FulfillmentChecker] Combined score:', combinedScore, 'threshold:', combinedThreshold);

  // Determine status based on combined score
  let status: FulfillmentStatus;
  if (combinedScore >= combinedThreshold) {
    status = 'fulfilled';
  } else if (combinedScore >= combinedThreshold * 0.7) {
    status = 'uncertain';
  } else {
    status = 'unfulfilled';
  }

  // Determine primary method (the one with highest score)
  let primaryMethod: 'pattern' | 'semantic-similarity' | 'nli-entailment' | 'combined';
  if (scores.pattern >= scores.semantic && scores.pattern >= scores.nli) {
    primaryMethod = 'pattern';
  } else if (scores.semantic >= scores.nli) {
    primaryMethod = 'semantic-similarity';
  } else {
    primaryMethod = 'nli-entailment';
  }

  // If multiple methods contributed significantly, use 'combined'
  const significantMethods = [
    scores.pattern > 0.5,
    scores.semantic > similarityThreshold * 0.8,
    scores.nli > entailmentThreshold * 0.8
  ].filter(Boolean).length;

  if (significantMethods >= 2) {
    primaryMethod = 'combined';
  }

  return {
    status,
    method: primaryMethod,
    confidence: combinedScore,
    details: {
      patternScore: scores.pattern,
      similarityScore: scores.semantic > 0 ? scores.semantic : undefined,
      entailmentScore: scores.nli > 0 ? scores.nli : undefined,
      combinedScore,
      matchedText: patternResult?.details?.matchedText
    }
  };
}

