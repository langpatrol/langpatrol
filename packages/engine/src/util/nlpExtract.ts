/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { pipeline, TokenClassificationPipeline, TokenClassificationSingle } from '@xenova/transformers';
import { join } from 'path';
import { normalizeNoun } from './normalize';

// Lazy-load the NER model
let nerPipeline: TokenClassificationPipeline | null = null;

/**
 * Entity types that represent nouns/noun phrases
 * These are the standard NER entity types that are noun-like
 */
const NOUN_ENTITY_TYPES = [
  'MISC',      // Miscellaneous entities
  'ORG',       // Organizations
  'PRODUCT',   // Products
  'LOC',       // Locations
  'PERSON',    // Person names (can be referenced)
  'EVENT',     // Events
  'WORK_OF_ART', // Works of art, documents, etc.
  'LAW',       // Legal entities
  'LANGUAGE'   // Languages
];

/**
 * Get the NER pipeline, loading from local model path
 */
async function getNERPipeline(): Promise<TokenClassificationPipeline> {
  if (!nerPipeline) {
    // Load from local path - use __dirname (works in CommonJS)
    const modelPath = join(__dirname, '../models/TinyBERT-finetuned-NER-ONNX');
    
    console.log('[NLP] Loading NER model from:', modelPath);
    try {
      nerPipeline = await pipeline(
        'token-classification',
        modelPath,
        {
          quantized: true,
        }
      );
      console.log('[NLP] NER model loaded successfully');
    } catch (error) {
      console.error('[NLP] Error loading NER model:', error);
      throw error;
    }
  }
  return nerPipeline;
}

interface NlpPipelineOutput extends TokenClassificationSingle {
  label: string
}
/**
 * Extract nouns and entities from text using NER
 * This provides better coverage than hardcoded taxonomy
 */
export async function extractNounsFromText(text: string): Promise<Set<string>> {
  const nouns = new Set<string>();
  
  try {
    // Use NER to find entities
    const pipeline = await getNERPipeline();
    const results = await pipeline(text);
    
    console.log('[NLP] NER results count:', results.length);
    
    // Extract all identified entities and tokens
    // Results can be an array or a single object
    const entities: NlpPipelineOutput[] = (Array.isArray(results) ? results : [results]) as NlpPipelineOutput[];
    
    // Filter to only noun-like entity types
    const nounEntities = entities.filter((e: NlpPipelineOutput) => {
      const entityType = e.entity || e.label;
      return entityType && NOUN_ENTITY_TYPES.includes(entityType);
    });
    
    console.log('[NLP] Filtered to', nounEntities.length, 'noun-like entities (out of', entities.length, 'total)');
    
    // Debug: log entity types to see what the model outputs
    if (entities.length > 0) {
      const entityTypes = new Set(entities.map((e: NlpPipelineOutput) => e.entity || e.label).filter(Boolean));
      console.log('[NLP] Entity types found:', Array.from(entityTypes));
    }
    
    for (const entity of nounEntities) {
      // Handle both TokenClassificationSingle and array formats
      const word = (entity as NlpPipelineOutput).word?.toLowerCase().trim() || (entity as NlpPipelineOutput).entity?.toLowerCase().trim();
      if (word && word.length >= 3 && !isStopWord(word)) {
        // Add the entity word
        nouns.add(word);
        // Also add normalized/singular form
        const normalized = normalizeNoun(word);
        if (normalized !== word) {
          nouns.add(normalized);
        }
      }
    }
    
    // Also extract noun phrases using pattern matching (complementary)
    // This catches nouns that NER might miss, but filter out verbs
    const nounPattern = /\b(the|this|that|these|those|a|an)\s+([a-z][a-z0-9_-]{2,})\b/gi;
    let match: RegExpExecArray | null;
    while ((match = nounPattern.exec(text)) !== null) {
      const noun = match[2].toLowerCase();
      // Only add if it's not a verb and not a stop word
      if (noun.length >= 3 && !isStopWord(noun) && !isVerb(noun)) {
        nouns.add(noun);
        const normalized = normalizeNoun(noun);
        nouns.add(normalized);
      }
    }
    
    console.log('[NLP] Extracted nouns:', Array.from(nouns).slice(0, 20), '... (total:', nouns.size, ')');
    return nouns;
  } catch (error) {
    console.error('[NLP] Error extracting nouns with NER:', error);
    // Fallback to pattern-based extraction
    return extractNounsPatternBased(text);
  }
}

/**
 * Fallback: Pattern-based noun extraction (no model required)
 */
function extractNounsPatternBased(text: string): Set<string> {
  const nouns = new Set<string>();
  const nounPattern = /\b(the|this|that|these|those|a|an)\s+([a-z][a-z0-9_-]{2,})\b/gi;
  let match: RegExpExecArray | null;
  
  while ((match = nounPattern.exec(text)) !== null) {
    const noun = match[2].toLowerCase();
    if (noun.length >= 3 && !isStopWord(noun)) {
      nouns.add(noun);
      nouns.add(normalizeNoun(noun));
    }
  }
  
  return nouns;
}

/**
 * Extract definite noun phrases (e.g., "the rows", "the table")
 * Uses NER + pattern matching for comprehensive coverage
 */
export async function extractDefiniteNounPhrases(
  text: string
): Promise<Array<{ text: string; head: string; index: number }>> {
  const phrases: Array<{ text: string; head: string; index: number }> = [];
  
  try {
    // Use NER to find entities
    const pipeline = await getNERPipeline();
    const results = await pipeline(text);
    
    // Results can be an array or a single object
    const entities = (Array.isArray(results) ? results : [results]) as NlpPipelineOutput[];
    
    // Filter to only noun-like entity types
    const nounEntities = entities.filter((e: NlpPipelineOutput) => {
      const entityType = e.entity || e.label;
      return entityType && NOUN_ENTITY_TYPES.includes(entityType);
    });
    
    console.log('[NLP] NER found', nounEntities.length, 'noun-like entities (out of', entities.length, 'total)');
    
    // Map NER results to phrases
    for (const entity of nounEntities) {
      const entityAny = entity as NlpPipelineOutput;
      const word = entityAny.word?.toLowerCase().trim() || entityAny.entity?.toLowerCase().trim();
      const start = entityAny.start !== undefined ? entityAny.start : entityAny.index;
      const end = entityAny.end !== undefined ? entityAny.end : (start !== undefined && word ? start + word.length : undefined);
      
      if (word && start !== undefined && end !== undefined) {
        if (word.length >= 3 && !isStopWord(word)) {
          // Check if it's part of a "the X" pattern by looking before the entity
          const beforeStart = Math.max(0, start - 10);
          const beforeText = text.slice(beforeStart, start).toLowerCase();
          
          // Check for determiners before the entity
          if (/\b(the|this|that|these|those|a|an)\s*$/i.test(beforeText)) {
            // Find the full phrase
            const phraseStart = beforeText.lastIndexOf('the') !== -1 ? 
              beforeStart + beforeText.lastIndexOf('the') :
              beforeStart + beforeText.lastIndexOf('this') !== -1 ? 
                beforeStart + beforeText.lastIndexOf('this') :
                beforeStart + beforeText.lastIndexOf('that') !== -1 ?
                  beforeStart + beforeText.lastIndexOf('that') :
                  start;
            
            const fullPhrase = text.slice(phraseStart, end).trim();
            phrases.push({
              text: fullPhrase,
              head: normalizeNoun(word),
              index: phraseStart
            });
          } else {
            // Entity without determiner - still add it as a potential reference
            phrases.push({
              text: word,
              head: normalizeNoun(word),
              index: start
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('[NLP] Error in NER extraction:', error);
  }
  
  // Also use pattern matching as fallback/complement
  // Filter out verbs to avoid detecting "that contain" etc.
  const pattern = /\b(the|this|that|these|those)\s+([a-z][a-z0-9_-]{2,})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const head = match[2].toLowerCase();
    // Filter out verbs and stop words
    if (!isStopWord(head) && !isVerb(head)) {
      phrases.push({
        text: match[0],
        head: normalizeNoun(head),
        index: match.index
      });
    }
  }
  
  // Remove duplicates based on index and head
  const uniquePhrases = new Map<string, { text: string; head: string; index: number }>();
  for (const phrase of phrases) {
    const key = `${phrase.index}-${phrase.head}`;
    if (!uniquePhrases.has(key) || phrase.text.length > uniquePhrases.get(key)!.text.length) {
      uniquePhrases.set(key, phrase);
    }
  }
  
  const sorted = Array.from(uniquePhrases.values()).sort((a, b) => a.index - b.index);
  console.log('[NLP] Extracted', sorted.length, 'noun phrases');
  return sorted;
}

/**
 * Check if NLP extraction is available
 */
export function isNLPExtractionAvailable(): boolean {
  return true; // Model will be loaded lazily
}

/**
 * Stop words to filter out
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'this', 'that', 'these', 'those', 'a', 'an', 'and', 'or', 'but',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is',
    'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
    'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must'
  ]);
  return stopWords.has(word);
}

/**
 * Simple verb filter for pattern matching fallback
 * Filters out common verbs to prevent detecting "that contain" etc. as noun phrases
 */
function isVerb(word: string): boolean {
  const commonVerbs = new Set([
    'contain', 'contains', 'contained', 'include', 'includes', 'included',
    'have', 'has', 'had', 'do', 'does', 'did', 'make', 'makes', 'made',
    'get', 'gets', 'got', 'take', 'takes', 'took', 'give', 'gives', 'gave',
    'go', 'goes', 'went', 'come', 'comes', 'came', 'see', 'sees', 'saw',
    'know', 'knows', 'knew', 'think', 'thinks', 'thought', 'say', 'says', 'said',
    'tell', 'tells', 'told', 'show', 'shows', 'showed', 'find', 'finds', 'found',
    'use', 'uses', 'used', 'work', 'works', 'worked', 'call', 'calls', 'called',
    'try', 'tries', 'tried', 'ask', 'asks', 'asked', 'need', 'needs', 'needed',
    'want', 'wants', 'wanted', 'like', 'likes', 'liked', 'look', 'looks', 'looked',
    'run', 'runs', 'ran', 'write', 'writes', 'wrote', 'read', 'reads',
    'create', 'creates', 'created', 'delete', 'deletes', 'deleted', 'update', 'updates', 'updated',
    'add', 'adds', 'added', 'remove', 'removes', 'removed', 'change', 'changes', 'changed',
    'set', 'sets', 'setting', 'send', 'sends', 'sent', 'receive', 'receives', 'received',
    'check', 'checks', 'checked', 'verify', 'verifies', 'verified', 'test', 'tests', 'tested'
  ]);
  
  const wordLower = word.toLowerCase();
  
  // Check base form
  if (commonVerbs.has(wordLower)) return true;
  
  // Check for common verb endings (simple heuristic)
  if (wordLower.endsWith('ing') && commonVerbs.has(wordLower.slice(0, -3))) return true;
  if (wordLower.endsWith('ed') && commonVerbs.has(wordLower.slice(0, -2))) return true;
  if (wordLower.endsWith('s') && commonVerbs.has(wordLower.slice(0, -1))) return true;
  
  return false;
}

