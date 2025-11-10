/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import { computeSemanticSimilarity, isSemanticSimilarityAvailable } from './semanticSimilarity';
import { checkEntailment, isNLIEntailmentAvailable } from './nliEntailment';
import { normalizeNoun, normalizePhrase } from './normalize';

export type FulfillmentStatus = 
  | 'fulfilled' 
  | 'unfulfilled' 
  | 'uncertain';

export type FulfillmentResult = {
  status: FulfillmentStatus;
  method: 'pattern' | 'semantic-similarity' | 'nli-entailment' | 'none';
  confidence: number; // 0-1
  details?: {
    similarityScore?: number;
    entailmentScore?: number;
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
  }
): Promise<FulfillmentResult> {
  const similarityThreshold = options?.similarityThreshold ?? 0.6;
  const entailmentThreshold = options?.entailmentThreshold ?? 0.7;
  const useSemanticSimilarity = options?.useSemanticSimilarity ?? true;
  const useNLIEntailment = options?.useNLIEntailment ?? true;

  // Step 1: Pattern matching (synchronous, always runs first)
  const patternResult = checkFulfillmentPattern(reference, searchText, effectiveNouns, effectiveSynonyms);
  if (patternResult.status === 'fulfilled') {
    return patternResult;
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

