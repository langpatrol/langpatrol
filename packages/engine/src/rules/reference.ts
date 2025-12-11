/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import type { AnalyzeInput, Report } from '../types';
import { 
  DEICTIC_CUES, 
  DEF_NP,
  getAllTaxonomyNouns,
  getSynonyms,
  SYNONYMS
} from '@langpatrol/rules';
import { joinMessages } from '../util/text';
import { createIssueId, createPreview } from '../util/reporting';
import { normalizeNoun, normalizePhrase } from '../util/normalize';
import { detectForwardReferences} from '../util/forwardRef';
import { checkFulfillmentPattern, checkFulfillment, checkFulfillmentCombined, type FulfillmentResult } from '../util/fulfillmentChecker';
import { isSemanticSimilarityAvailable } from '../util/semanticSimilarity';
import { isNLIEntailmentAvailable } from '../util/nliEntailment';
import { extractNounsFromText, extractDefiniteNounPhrases, isNLPExtractionAvailable } from '../util/nlpExtract';

export function run(input: AnalyzeInput, acc: Report): void {
  const messages = input.messages || [];
  const scope: { type: 'prompt' | 'messages'; messageIndex?: number } =
    messages.length > 0
      ? { type: 'messages', messageIndex: messages.length - 1 }
      : { type: 'prompt' };

  // Handle both prompt-only and messages scenarios
  // When both prompt and messages are provided, combine them:
  // - current = last message (or prompt if no messages)
  // - history = prompt + all messages except last (full conversation context)
  let current: string;
  let historyText: string;

  if (messages.length > 0) {
    // Multi-turn conversation: current is last message, history includes prompt + previous messages
    current = messages[messages.length - 1]?.content || '';
    const historyMessages = messages.slice(0, -1);
    const historyParts: string[] = [];
    
    // Include prompt in history if provided
    if (input.prompt) {
      historyParts.push(input.prompt);
    }
    
    // Include all previous messages
    if (historyMessages.length > 0) {
      historyParts.push(joinMessages(historyMessages));
    }
    
    historyText = historyParts.join('\n');
  } else if (input.prompt) {
    // Single prompt without messages
    current = input.prompt;
    historyText = '';
  } else {
    // No input to analyze
    return;
  }

  // Phase 2: Build effective noun lexicon (taxonomy + user extensions + NLP extraction if enabled)
  const effectiveNouns = new Set(getAllTaxonomyNouns());
  if (input.options?.referenceHeads) {
    input.options.referenceHeads.forEach(noun => effectiveNouns.add(noun.toLowerCase()));
  }
  
  // If NLP extraction is enabled, extract nouns from current text and history
  // Note: This is async, so we'll handle it in runAsync. For sync version, use taxonomy only.
  
  // Phase 2: Build effective synonym map (default + user extensions)
  const effectiveSynonyms: Record<string, Set<string>> = {};
  // Initialize with default synonyms
  Object.keys(SYNONYMS).forEach(head => {
    effectiveSynonyms[head] = getSynonyms(head);
  });
  // Merge user-provided synonyms
  if (input.options?.synonyms) {
    Object.entries(input.options.synonyms).forEach(([head, syns]) => {
      const headLower = head.toLowerCase();
      if (!effectiveSynonyms[headLower]) {
        effectiveSynonyms[headLower] = new Set([headLower]);
      }
      syns.forEach(syn => effectiveSynonyms[headLower].add(syn.toLowerCase()));
    });
  }
  
  // Phase 2: Get search window limits
  const windowMessages = input.options?.antecedentWindow?.messages;
  const windowBytes = input.options?.antecedentWindow?.bytes;
  
  // Apply windowing to history
  // Note: prompt is always included in history, windowing only applies to messages
  let searchableHistory = historyText;
  if (messages.length > 0 && windowMessages) {
    const historyMessages = messages.slice(0, -1);
    const windowedMessages = windowMessages > 0 
      ? historyMessages.slice(-windowMessages)
      : historyMessages;
    
    // Rebuild history with prompt + windowed messages
    const historyParts: string[] = [];
    if (input.prompt) {
      historyParts.push(input.prompt);
    }
    if (windowedMessages.length > 0) {
      historyParts.push(joinMessages(windowedMessages));
    }
    searchableHistory = historyParts.join('\n');
  }
  if (windowBytes && searchableHistory.length > windowBytes) {
    searchableHistory = searchableHistory.slice(-windowBytes);
  }

  // Phase 2: Build noun memory cache from prior text
  // Track head nouns mentioned WITHOUT "the" (bare mentions) in history + current text
  const nounMemory = new Set<string>();
  
  // Helper: Check if a noun appears as a bare mention (not preceded by "the")
  const findBareMentions = (text: string): Set<string> => {
    const found = new Set<string>();
    const textLower = text.toLowerCase();
    
    for (const noun of effectiveNouns) {
      // Find all occurrences of the noun (singular or plural)
      const nounPattern = new RegExp(`\\b${noun}s?\\b`, 'gi');
      let match: RegExpExecArray | null;
      const regex = new RegExp(nounPattern.source, nounPattern.flags);
      
      while ((match = regex.exec(textLower)) !== null) {
        const start = match.index;
        // Check if "the " appears before this noun (within reasonable distance)
        const beforeStart = Math.max(0, start - 10);
        const beforeText = textLower.slice(beforeStart, start);
        // If "the " is not immediately before this noun, it's a bare mention
        if (!beforeText.endsWith('the ') && !beforeText.endsWith('the\n') && !beforeText.endsWith('the\t')) {
          found.add(noun);
          break; // Found at least one bare mention, no need to check more
        }
      }
    }
    
    return found;
  };
  
  // Scan history for bare noun mentions (only history, not current text)
  if (searchableHistory) {
    const historyBare = findBareMentions(searchableHistory);
    historyBare.forEach(noun => nounMemory.add(noun));
  }

  // Note: We DON'T add current text bare mentions to global nounMemory here
  // because we need to check sequential order (bare mention must come BEFORE "the X")
  // This is handled in antecedentFound() by checking textBefore for each candidate

  const candidates: Array<{ span: string; head: string; index: number }> = [];

  // Create a fresh regex instance to avoid lastIndex issues
  const regex = new RegExp(DEF_NP.source, DEF_NP.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(current)) !== null) {
    const head = match[2].toLowerCase();
    const normalizedHead = normalizeNoun(head);
    // Check against effective nouns (taxonomy + extensions)
    if (effectiveNouns.has(head) || effectiveNouns.has(normalizedHead)) {
      candidates.push({ span: match[0], head: normalizedHead, index: match.index });
    }
  }

  // Detect forward references (e.g., "the following report", "as shown below")
  const forwardRefs = detectForwardReferences(current);
  const forwardRefCandidates: Array<{ span: string; head?: string; index: number; isForwardRef: boolean }> = [];
  
  for (const fref of forwardRefs) {
    // If the forward reference extracted a noun, check if it's in our taxonomy
    if (fref.extractedNoun) {
      const normalizedNoun = normalizeNoun(fref.extractedNoun);
      if (effectiveNouns.has(fref.extractedNoun) || effectiveNouns.has(normalizedNoun)) {
        forwardRefCandidates.push({
          span: fref.text,
          head: normalizedNoun,
          index: fref.start,
          isForwardRef: true
        });
      } else {
        // Forward reference without a specific noun (e.g., "as shown below")
        forwardRefCandidates.push({
          span: fref.text,
          index: fref.start,
          isForwardRef: true
        });
      }
    } else {
      // Forward reference without a specific noun (e.g., "as shown below")
      forwardRefCandidates.push({
        span: fref.text,
        index: fref.start,
        isForwardRef: true
      });
    }
  }

  const deicticCue = DEICTIC_CUES.test(current);
  if (candidates.length === 0 && forwardRefCandidates.length === 0 && !deicticCue) return;

  const hasHistory = searchableHistory.trim().split(/\s+/).length > 40;
  const attachmentsText = (input.attachments || [])
    .map((a) => normalizePhrase(a.name || a.type))
    .join(' ');
  
  // Phase 2: Enhanced antecedent check with hierarchical fulfillment (pattern → semantic similarity → NLI entailment)
  // For forward references, also check future content in multi-turn conversations
  const antecedentFound = (cand: { span?: string; head: string; index: number; isForwardRef?: boolean }): { found: boolean; method?: 'exact' | 'synonym' | 'memory' | 'attachment' | 'pattern' | 'semantic-similarity' | 'nli-entailment'; confidencePenalty?: boolean; fulfillmentResult?: FulfillmentResult } => {
    const token = cand.head; // already normalized
    const searchText = normalizePhrase(searchableHistory);
    const searchTextLower = searchText.toLowerCase();
    
    // Get the reference span text
    const refSpan = cand.span || current.slice(cand.index, cand.index + 50);
    
    // For forward references, also check future content (text after the reference in current message)
    let futureContent = '';
    if (cand.isForwardRef) {
      // Check text after the reference in the current message
      const textAfterRef = current.slice(cand.index + (cand.span?.length || 0));
      futureContent = normalizePhrase(textAfterRef);
    }
    
    // Use hierarchical fulfillment checker (pattern matching first)
    const fulfillmentResult = checkFulfillmentPattern(refSpan, searchText, effectiveNouns, effectiveSynonyms);
    
    // If pattern matching found it in history, return early
    if (fulfillmentResult.status === 'fulfilled' && fulfillmentResult.method === 'pattern') {
      return { 
        found: true, 
        method: 'pattern',
        fulfillmentResult 
      };
    }
    
    // For forward references, also check future content (text after the reference)
    if (cand.isForwardRef && futureContent) {
      const futureFulfillment = checkFulfillmentPattern(refSpan, futureContent, effectiveNouns, effectiveSynonyms);
      if (futureFulfillment.status === 'fulfilled') {
        return { 
          found: true, 
          method: 'pattern',
          fulfillmentResult: futureFulfillment 
        };
      }
    }
    
    // Note: Async semantic/NLI checking will be done in runAsync when semantic features are enabled
    
    // Fall back to existing logic for backward compatibility
    // 1. Exact match in history (normalized)
    const exactPattern = new RegExp(`\\b${token}s?\\b`, 'i');
    if (hasHistory && exactPattern.test(searchTextLower)) {
      return { found: true, method: 'exact', fulfillmentResult };
    }
    
    // 2. For prompt-only input, check if token appears BEFORE this candidate in current text
    // (This handles cases where "report" appears earlier in the same prompt)
    // But exclude matches within "the X" phrases (those don't count as antecedents)
    if (!hasHistory) {
      const textBefore = current.slice(0, cand.index);
      const textBeforeNormalized = normalizePhrase(textBefore);
      const beforeLower = textBeforeNormalized.toLowerCase();
      const matches = [...beforeLower.matchAll(new RegExp(`\\b${token}s?\\b`, 'gi'))];
      for (const match of matches) {
        const matchIndex = match.index!;
        const beforeMatch = beforeLower.slice(Math.max(0, matchIndex - 10), matchIndex);
        // Only count if it's NOT part of "the X" phrase
        if (!beforeMatch.endsWith('the ') && !beforeMatch.endsWith('the\n') && !beforeMatch.endsWith('the\t')) {
          return { found: true, method: 'exact' };
        }
      }
    }
    
    // 3. Synonym match in history (with context awareness)
    const synonyms = effectiveSynonyms[token] || new Set([token]);
    for (const syn of synonyms) {
      const synPattern = new RegExp(`\\b${syn}s?\\b`, 'i');
      if (hasHistory && synPattern.test(searchTextLower)) {
        // Check if synonym appears in a reasonable context (not just "this file" or "the file")
        const synMatches = [...searchTextLower.matchAll(new RegExp(`\\b${syn}s?\\b`, 'gi'))];
        for (const match of synMatches) {
          const matchIndex = match.index!;
          const contextBefore = searchTextLower.slice(Math.max(0, matchIndex - 30), matchIndex);
          // Skip if it's clearly referring to something else (e.g., "this file", "the file", "a file")
          const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every '];
          const shouldSkip = skipPatterns.some(p => contextBefore.endsWith(p));
          if (!shouldSkip) {
            return { found: true, method: 'synonym' };
          }
        }
      }
      // Also check synonyms in current text before this candidate
      if (!hasHistory) {
        const textBefore = current.slice(0, cand.index);
        const textBeforeNormalized = normalizePhrase(textBefore);
        const beforeLower = textBeforeNormalized.toLowerCase();
        const synMatches = [...beforeLower.matchAll(new RegExp(`\\b${syn}s?\\b`, 'gi'))];
        for (const match of synMatches) {
          const matchIndex = match.index!;
          const beforeMatch = beforeLower.slice(Math.max(0, matchIndex - 30), matchIndex);
          // Skip if it's clearly referring to something else (e.g., "this file", "the file", "a file")
          const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every '];
          const shouldSkip = skipPatterns.some(p => beforeMatch.endsWith(p));
          // Also skip if it's part of "the X" phrase (those don't count as antecedents)
          const shouldSkipThe = beforeMatch.endsWith('the ') || beforeMatch.endsWith('the\n') || beforeMatch.endsWith('the\t');
          if (!shouldSkip && !shouldSkipThe) {
            // Additional check: if synonym is very far from candidate, add confidence penalty
            const distance = cand.index - matchIndex;
            const hasPenalty = distance > 5000; // More than 5000 chars away
            return { found: true, method: 'synonym', confidencePenalty: hasPenalty };
          }
        }
      }
    }
    
    // 4. Check noun memory from history (was this noun mentioned earlier as a bare mention?)
    // But only if it's not in a context that suggests it's referring to something else
    if (nounMemory.has(token)) {
      // Double-check: was this really a valid bare mention, or was it in "this file" etc?
      if (hasHistory) {
        const historyMatches = [...searchTextLower.matchAll(new RegExp(`\\b${token}s?\\b`, 'gi'))];
        for (const match of historyMatches) {
          const matchIndex = match.index!;
          const contextBefore = searchTextLower.slice(Math.max(0, matchIndex - 30), matchIndex);
          const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every '];
          const shouldSkip = skipPatterns.some(p => contextBefore.endsWith(p));
          if (!shouldSkip) {
            return { found: true, method: 'memory' };
          }
        }
      } else {
        // For prompt-only, check current text before candidate
        const textBefore = current.slice(0, cand.index);
        const textBeforeNormalized = normalizePhrase(textBefore);
        const beforeLower = textBeforeNormalized.toLowerCase();
        const matches = [...beforeLower.matchAll(new RegExp(`\\b${token}s?\\b`, 'gi'))];
        for (const match of matches) {
          const matchIndex = match.index!;
          const beforeMatch = beforeLower.slice(Math.max(0, matchIndex - 30), matchIndex);
          const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every ', 'the '];
          const shouldSkip = skipPatterns.some(p => beforeMatch.endsWith(p));
          if (!shouldSkip) {
            return { found: true, method: 'memory' };
          }
        }
      }
    }
    
    // 5. Check synonyms in noun memory (with context awareness)
    for (const syn of synonyms) {
      if (nounMemory.has(syn)) {
        // Double-check context for the synonym
        if (hasHistory) {
          const synMatches = [...searchTextLower.matchAll(new RegExp(`\\b${syn}s?\\b`, 'gi'))];
          for (const match of synMatches) {
            const matchIndex = match.index!;
            const contextBefore = searchTextLower.slice(Math.max(0, matchIndex - 30), matchIndex);
            const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every '];
            const shouldSkip = skipPatterns.some(p => contextBefore.endsWith(p));
            if (!shouldSkip) {
              return { found: true, method: 'synonym' };
            }
          }
        } else {
          // For prompt-only, check current text before candidate
          const textBefore = current.slice(0, cand.index);
          const textBeforeNormalized = normalizePhrase(textBefore);
          const beforeLower = textBeforeNormalized.toLowerCase();
          const synMatches = [...beforeLower.matchAll(new RegExp(`\\b${syn}s?\\b`, 'gi'))];
          for (const match of synMatches) {
            const matchIndex = match.index!;
            const beforeMatch = beforeLower.slice(Math.max(0, matchIndex - 30), matchIndex);
            const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every ', 'the '];
            const shouldSkip = skipPatterns.some(p => beforeMatch.endsWith(p));
            if (!shouldSkip) {
              return { found: true, method: 'synonym' };
            }
          }
        }
      }
    }
    
    // 6. Check if this specific "the X" appears AFTER a bare mention of X in current text
    // (sequential order check - bare mention must come BEFORE "the X")
    const textBefore = current.slice(0, cand.index);
    const bareBefore = findBareMentions(textBefore);
    if (bareBefore.has(token)) {
      // Verify context - make sure it's not "this X" or "the X"
      const textBeforeNormalized = normalizePhrase(textBefore);
      const beforeLower = textBeforeNormalized.toLowerCase();
      const matches = [...beforeLower.matchAll(new RegExp(`\\b${token}s?\\b`, 'gi'))];
      for (const match of matches) {
        const matchIndex = match.index!;
        const beforeMatch = beforeLower.slice(Math.max(0, matchIndex - 30), matchIndex);
        const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every ', 'the '];
        const shouldSkip = skipPatterns.some(p => beforeMatch.endsWith(p));
        if (!shouldSkip) {
          return { found: true, method: 'memory' };
        }
      }
    }
    
    // Check synonyms in text before (with context verification)
    for (const syn of synonyms) {
      if (bareBefore.has(syn)) {
        // Verify context - make sure it's not "this X" or "the X"
        const textBeforeNormalized = normalizePhrase(textBefore);
        const beforeLower = textBeforeNormalized.toLowerCase();
        const synMatches = [...beforeLower.matchAll(new RegExp(`\\b${syn}s?\\b`, 'gi'))];
        for (const match of synMatches) {
          const matchIndex = match.index!;
          const beforeMatch = beforeLower.slice(Math.max(0, matchIndex - 30), matchIndex);
          const skipPatterns = ['this ', 'that ', 'a ', 'an ', 'some ', 'any ', 'each ', 'every ', 'the '];
          const shouldSkip = skipPatterns.some(p => beforeMatch.endsWith(p));
          if (!shouldSkip) {
            return { found: true, method: 'synonym' };
          }
        }
      }
    }
    
    // 7. Check attachments (normalized)
    const normalizedAttachments = normalizePhrase(attachmentsText);
    if (normalizedAttachments.includes(token)) {
      return { found: true, method: 'attachment', fulfillmentResult };
    }
    for (const syn of synonyms) {
      if (normalizedAttachments.includes(syn)) {
        return { found: true, method: 'attachment', fulfillmentResult };
      }
    }
    
    // Always return pattern result for details, even if not found
    return { found: false, method: 'pattern' as const, fulfillmentResult };
  };

  // Combine regular candidates and forward reference candidates
  const allCandidates = [
    ...candidates.map(c => ({ ...c, isForwardRef: false as const })),
    ...forwardRefCandidates.map(c => ({ 
      span: c.span, 
      head: c.head || '', 
      index: c.index, 
      isForwardRef: true as const 
    }))
  ];
  
  const uncovered = allCandidates.filter((c) => {
    if (!c.head && c.isForwardRef) {
      // Forward reference without specific noun - check if it's fulfilled
      const result = antecedentFound(c);
      return !result.found;
    }
    return !antecedentFound(c).found;
  });
  
  // Track resolved candidates with confidence penalties and fulfillment results
  const resolvedWithPenalty = new Set<string>();
  const fulfillmentResults = new Map<number, FulfillmentResult>();
  for (const cand of allCandidates) {
    const result = antecedentFound(cand);
    // Always store fulfillmentResult if available, even if not found, so we can show scores
    if (result.fulfillmentResult) {
      fulfillmentResults.set(cand.index, result.fulfillmentResult);
    }
    if (result.found) {
      if (result.confidencePenalty && cand.head) {
        resolvedWithPenalty.add(cand.head);
      }
    }
  }
  
  // Also check forward references for fulfillment in future content
  for (const fref of forwardRefCandidates) {
    if (fref.head) {
      const cand = { span: fref.span, head: fref.head, index: fref.index, isForwardRef: true };
      const result = antecedentFound(cand);
      // Always store fulfillmentResult if available
      if (result.fulfillmentResult) {
        fulfillmentResults.set(fref.index, result.fulfillmentResult);
      }
    }
  }
  
  // Phase 2: Scoring system
  // Score = +1 deictic, +1 definite NP with known head, +1 instruction like continue
  //        -2 if antecedent found by exact/synonym/pattern, -1 if found by memory/attachment
  let score = 0;
  if (deicticCue) score += 1;
  if (allCandidates.length > 0) score += 1;
  // Subtract for resolved candidates
  for (const cand of allCandidates) {
    const result = antecedentFound(cand);
    if (result.found) {
      if (result.method === 'exact' || result.method === 'synonym' || result.method === 'pattern') {
        score -= 2;
      } else if (result.method === 'memory' || result.method === 'attachment') {
        score -= 1;
      }
    }
  }
  
  // Determine confidence based on resolution method and history length
  let confidence: 'low' | 'medium' | 'high' = 'high';
  const historyWordCount = searchableHistory.trim().split(/\s+/).length;
  if (historyWordCount < 20) {
    confidence = 'low';
  } else if (uncovered.length > 0) {
    // If we have uncovered references, check if any resolved candidates used uncertain methods
    const resolvedCandidates = allCandidates.filter(c => antecedentFound(c).found);
    const hasUncertainResolution = resolvedCandidates.some(cand => {
      const result = antecedentFound(cand);
      return result.method === 'synonym' || result.method === 'memory' || result.method === 'pattern';
    });
    if (hasUncertainResolution) {
      confidence = 'medium';
    }
  }
  
  // Apply confidence penalty if any candidates were resolved via synonym with penalty flag
  if (resolvedWithPenalty.size > 0 && uncovered.length === 0) {
    // If all candidates were resolved but some had confidence penalties, reduce confidence
    confidence = confidence === 'high' ? 'medium' : 'low';
  }
  
  // Flag if we have any uncovered references (these lack antecedents)
  // OR if we have deictic cues without any candidates that have antecedents
  // OR if score >= 2 (scoring threshold)
  const shouldFlag = uncovered.length > 0 || (deicticCue && allCandidates.length === 0) || score >= 2;

  if (!shouldFlag) return;

  const issueId = createIssueId();

  const summaryMap = new Map<string, number>();
  for (const item of uncovered) {
    const key = item.span.toLowerCase();
    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
  }
  if (deicticCue) {
    summaryMap.set('deictic cue', (summaryMap.get('deictic cue') || 0) + 1);
  }

  const summary = Array.from(summaryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([text, count]) => ({ text, count }));

  const occurrences = uncovered.slice(0, 50).map((item) => {
    const start = item.index;
    const span = item.span || current.slice(start, start + 50);
    const end = start + span.length;
    const fulfillmentResult = fulfillmentResults.get(start);
    const result = antecedentFound(item);
    
    // Determine fulfillment status
    let fulfillmentStatus: 'fulfilled' | 'unfulfilled' | 'uncertain' = 'unfulfilled';
    if (result.found && fulfillmentResult) {
      fulfillmentStatus = fulfillmentResult.status;
    } else if (result.found) {
      fulfillmentStatus = 'fulfilled';
    }
    
    return {
      text: span,
      start,
      end,
      messageIndex: scope.messageIndex,
      preview: createPreview(current, start, end),
      resolution: result.found ? 
        (result.method === 'exact' ? 'resolved-by-exact' as const :
         result.method === 'synonym' ? 'resolved-by-synonym' as const :
         result.method === 'memory' ? 'resolved-by-memory' as const :
         result.method === 'attachment' ? 'resolved-by-attachment' as const :
         'unresolved' as const) : 
        'unresolved' as const,
      fulfillmentStatus,
      fulfillmentMethod: fulfillmentResult?.method || 
        (result.method === 'pattern' ? 'pattern' :
         result.method === 'semantic-similarity' ? 'semantic-similarity' :
         result.method === 'nli-entailment' ? 'nli-entailment' : 'none'),
      fulfillmentConfidence: fulfillmentResult?.confidence || (result.found ? 0.8 : 0.0),
      fulfillmentDetails: fulfillmentResult?.details ? {
        patternScore: fulfillmentResult.details.patternScore,
        similarityScore: fulfillmentResult.details.similarityScore,
        entailmentScore: fulfillmentResult.details.entailmentScore,
        combinedScore: fulfillmentResult.details.combinedScore,
        matchedText: fulfillmentResult.details.matchedText
      } : undefined,
      term: item.head || undefined,
      turn: scope.messageIndex
    };
  });

  if (deicticCue) {
    occurrences.push({
      text: 'deictic cue present',
      start: -1,
      end: -1,
      messageIndex: scope.messageIndex,
      preview: '',
      resolution: 'unresolved' as const,
      fulfillmentStatus: 'unfulfilled' as const,
      fulfillmentMethod: 'none' as const,
      fulfillmentConfidence: 0.0,
      fulfillmentDetails: undefined,
      term: undefined,
      turn: scope.messageIndex
    });
  }

  const firstMatch = occurrences.find((occ) => occ.start >= 0);

  const detail = `References ${summary
    .slice(0, 3)
    .map((s) => `"${s.text}"${s.count > 1 ? ` (×${s.count})` : ''}`)
    .join(', ')} without antecedent in prior context or attachments.`;

  acc.issues.push({
    id: issueId,
    code: 'MISSING_REFERENCE',
    severity: 'high',
    detail,
    evidence: {
      summary,
      occurrences,
      firstSeenAt: {
        messageIndex: scope.messageIndex,
        char: firstMatch && firstMatch.start >= 0 ? firstMatch.start : undefined
      }
    },
    scope,
    confidence
  });

  // Generate targeted suggestions based on head noun
  const heads = new Set(uncovered.map((c) => c.head));
  for (const head of heads) {
    if (head === 'report' || head === 'document' || head === 'transcript') {
      acc.suggestions = acc.suggestions || [];
      acc.suggestions.push({
        type: 'ADD_CONTEXT',
        text: 'Inline a 1–3 line summary or attach the file metadata.',
        for: issueId
      });
    } else if (head === 'list' || head === 'results') {
      acc.suggestions = acc.suggestions || [];
      acc.suggestions.push({
        type: 'ADD_CONTEXT',
        text: 'Paste the prior items or a compact summary before asking to continue.',
        for: issueId
      });
    }
  }
}

/**
 * Async version of run that supports semantic similarity and NLI entailment checking.
 * This is used when semantic features are enabled via options.
 */
export async function runAsync(input: AnalyzeInput, acc: Report): Promise<void> {
  // Check if semantic/NLI features are enabled
  const useSemanticFeatures = 
    input.options?.similarityThreshold !== undefined ||
    input.options?.useSemanticSimilarity === true ||
    input.options?.useNLIEntailment === true;
  
  console.log('[Reference] runAsync called. useSemanticFeatures:', useSemanticFeatures);
  console.log('[Reference] Options:', {
    similarityThreshold: input.options?.similarityThreshold,
    useSemanticSimilarity: input.options?.useSemanticSimilarity,
    useNLIEntailment: input.options?.useNLIEntailment,
    useCombinedScoring: input.options?.useCombinedScoring
  });
  console.log('[Reference] Semantic similarity available:', isSemanticSimilarityAvailable());
  console.log('[Reference] NLI available:', isNLIEntailmentAvailable());
  
  // If semantic features are not enabled, use the sync version
  if (!useSemanticFeatures || (!isSemanticSimilarityAvailable() && !isNLIEntailmentAvailable())) {
    console.log('[Reference] Falling back to sync version');
    run(input, acc);
    return;
  }
  
  console.log('[Reference] Using async version with semantic features');

  // Otherwise, use async version with semantic/NLI checking
  const messages = input.messages || [];
  const scope: { type: 'prompt' | 'messages'; messageIndex?: number } =
    messages.length > 0
      ? { type: 'messages', messageIndex: messages.length - 1 }
      : { type: 'prompt' };

  // Handle both prompt-only and messages scenarios
  // When both prompt and messages are provided, combine them:
  // - current = last message (or prompt if no messages)
  // - history = prompt + all messages except last (full conversation context)
  let current: string;
  let historyText: string;

  if (messages.length > 0) {
    // Multi-turn conversation: current is last message, history includes prompt + previous messages
    current = messages[messages.length - 1]?.content || '';
    const historyMessages = messages.slice(0, -1);
    const historyParts: string[] = [];
    
    // Include prompt in history if provided
    if (input.prompt) {
      historyParts.push(input.prompt);
    }
    
    // Include all previous messages
    if (historyMessages.length > 0) {
      historyParts.push(joinMessages(historyMessages));
    }
    
    historyText = historyParts.join('\n');
  } else if (input.prompt) {
    // Single prompt without messages
    current = input.prompt;
    historyText = '';
  } else {
    return;
  }

  // Build effective noun lexicon and synonyms (same as sync version)
  const effectiveNouns = new Set(getAllTaxonomyNouns());
  if (input.options?.referenceHeads) {
    input.options.referenceHeads.forEach(noun => effectiveNouns.add(noun.toLowerCase()));
  }
  
  const effectiveSynonyms: Record<string, Set<string>> = {};
  Object.keys(SYNONYMS).forEach(head => {
    effectiveSynonyms[head] = getSynonyms(head);
  });
  if (input.options?.synonyms) {
    Object.entries(input.options.synonyms).forEach(([head, syns]) => {
      const headLower = head.toLowerCase();
      if (!effectiveSynonyms[headLower]) {
        effectiveSynonyms[headLower] = new Set([headLower]);
      }
      syns.forEach(syn => effectiveSynonyms[headLower].add(syn.toLowerCase()));
    });
  }
  
  // Get search window limits
  const windowMessages = input.options?.antecedentWindow?.messages;
  const windowBytes = input.options?.antecedentWindow?.bytes;
  
  // Apply windowing to history
  // Note: prompt is always included in history, windowing only applies to messages
  let searchableHistory = historyText;
  if (messages.length > 0 && windowMessages) {
    const historyMessages = messages.slice(0, -1);
    const windowedMessages = windowMessages > 0 
      ? historyMessages.slice(-windowMessages)
      : historyMessages;
    
    // Rebuild history with prompt + windowed messages
    const historyParts: string[] = [];
    if (input.prompt) {
      historyParts.push(input.prompt);
    }
    if (windowedMessages.length > 0) {
      historyParts.push(joinMessages(windowedMessages));
    }
    searchableHistory = historyParts.join('\n');
  }
  if (windowBytes && searchableHistory.length > windowBytes) {
    searchableHistory = searchableHistory.slice(-windowBytes);
  }

  // Build noun memory cache
  const nounMemory = new Set<string>();
  const findBareMentions = (text: string): Set<string> => {
    const found = new Set<string>();
    const textLower = text.toLowerCase();
    
    for (const noun of effectiveNouns) {
      const nounPattern = new RegExp(`\\b${noun}s?\\b`, 'gi');
      let match: RegExpExecArray | null;
      const regex = new RegExp(nounPattern.source, nounPattern.flags);
      
      while ((match = regex.exec(textLower)) !== null) {
        const start = match.index;
        const beforeStart = Math.max(0, start - 10);
        const beforeText = textLower.slice(beforeStart, start);
        if (!beforeText.endsWith('the ') && !beforeText.endsWith('the\n') && !beforeText.endsWith('the\t')) {
          found.add(noun);
          break;
        }
      }
    }
    
    return found;
  };
  
  if (searchableHistory) {
    const historyBare = findBareMentions(searchableHistory);
    historyBare.forEach(noun => nounMemory.add(noun));
  }

  // Find candidates - use NLP extraction if enabled, otherwise use taxonomy
  const candidates: Array<{ span: string; head: string; index: number }> = [];
  let useNLP = input.options?.useNLPExtraction === true && isNLPExtractionAvailable();
  
  if (useNLP) {
    // Use NLP to extract noun phrases from current text
    console.log('[Reference] Using NLP extraction for noun phrases');
    try {
      const nlpPhrases = await extractDefiniteNounPhrases(current);
      for (const phrase of nlpPhrases) {
        // Accept all nouns found by NLP (broader coverage)
        candidates.push({
          span: phrase.text,
          head: phrase.head,
          index: phrase.index
        });
      }
      
      // Also extract all nouns to expand effectiveNouns set
      const extractedNouns = await extractNounsFromText(current);
      extractedNouns.forEach(noun => effectiveNouns.add(noun));
      
      // Also extract from history for better context
      if (searchableHistory) {
        const historyNouns = await extractNounsFromText(searchableHistory);
        historyNouns.forEach(noun => effectiveNouns.add(noun));
      }
      
      console.log('[Reference] NLP extracted', candidates.length, 'candidates,', effectiveNouns.size, 'total nouns');
    } catch (error) {
      console.error('[Reference] Error in NLP extraction, falling back to taxonomy:', error);
      // Fall through to taxonomy-based extraction
      useNLP = false;
    }
  }
  
  // Taxonomy-based extraction (used if NLP is disabled or failed)
  if (!useNLP) {
    console.log('[Reference] Using taxonomy-based extraction');
    const regex = new RegExp(DEF_NP.source, DEF_NP.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(current)) !== null) {
      const head = match[2].toLowerCase();
      const normalizedHead = normalizeNoun(head);
      if (effectiveNouns.has(head) || effectiveNouns.has(normalizedHead)) {
        candidates.push({ span: match[0], head: normalizedHead, index: match.index });
      }
    }
  }

  // Detect forward references
  const forwardRefs = detectForwardReferences(current);
  const forwardRefCandidates: Array<{ span: string; head?: string; index: number; isForwardRef: boolean }> = [];
  
  for (const fref of forwardRefs) {
    if (fref.extractedNoun) {
      const normalizedNoun = normalizeNoun(fref.extractedNoun);
      // If using NLP, accept all extracted nouns; otherwise check against taxonomy
      if (useNLP || effectiveNouns.has(fref.extractedNoun) || effectiveNouns.has(normalizedNoun)) {
        forwardRefCandidates.push({
          span: fref.text,
          head: normalizedNoun,
          index: fref.start,
          isForwardRef: true
        });
      } else {
        forwardRefCandidates.push({
          span: fref.text,
          index: fref.start,
          isForwardRef: true
        });
      }
    } else {
      forwardRefCandidates.push({
        span: fref.text,
        index: fref.start,
        isForwardRef: true
      });
    }
  }
  
  // If using NLP, also detect forward references with dynamic patterns
  // e.g., "the rows below", "the table below" - these aren't in FORWARD_REF_PATTERNS
  if (useNLP) {
    try {
      // Extract nouns that appear with "below", "following", etc.
      const forwardPattern = /\b(the|this|that|these|those)\s+([a-z][a-z0-9_-]{2,})\s+(below|following|next|ahead)\b/gi;
      let match: RegExpExecArray | null;
      while ((match = forwardPattern.exec(current)) !== null) {
        const head = match[2].toLowerCase();
        const normalizedHead = normalizeNoun(head);
        // Check if we haven't already added this
        const alreadyAdded = forwardRefCandidates.some(
          f => f.index === match!.index && f.head === normalizedHead
        );
        if (!alreadyAdded) {
          forwardRefCandidates.push({
            span: match[0],
            head: normalizedHead,
            index: match.index,
            isForwardRef: true
          });
        }
      }
      console.log('[Reference] NLP found', forwardRefCandidates.length, 'forward references');
    } catch (error) {
      console.error('[Reference] Error in NLP forward reference detection:', error);
    }
  }

  const deicticCue = DEICTIC_CUES.test(current);
  if (candidates.length === 0 && forwardRefCandidates.length === 0 && !deicticCue) return;

  const hasHistory = searchableHistory.trim().split(/\s+/).length > 40;
  const attachmentsText = (input.attachments || [])
    .map((a) => normalizePhrase(a.name || a.type))
    .join(' ');

  // Async antecedent check with hierarchical fulfillment
  const antecedentFoundAsync = async (cand: { span?: string; head: string; index: number; isForwardRef?: boolean }): Promise<{ found: boolean; method?: 'exact' | 'synonym' | 'memory' | 'attachment' | 'pattern' | 'semantic-similarity' | 'nli-entailment'; confidencePenalty?: boolean; fulfillmentResult?: FulfillmentResult }> => {
    const token = cand.head;
    // For semantic checks, use current text if history is empty (prompt-only scenario)
    // We need to search in the text BEFORE the reference to find antecedents
    const refSpan = cand.span || current.slice(cand.index, cand.index + 50);
    const refIndex = cand.index;
    
    // Build search text: history + current text before the reference
    let textToSearch = searchableHistory;
    if (refIndex > 0) {
      // Include text before the reference from current text
      const beforeRef = current.slice(0, refIndex);
      textToSearch = searchableHistory ? `${searchableHistory} ${beforeRef}` : beforeRef;
    }
    const searchText = normalizePhrase(textToSearch);
    
    console.log('[Reference] antecedentFoundAsync - refSpan:', refSpan.substring(0, 50), 'searchText length:', searchText.length, 'hasHistory:', !!searchableHistory);
    
    // Step 1: Fast synchronous pattern matching (only if enabled)
    const usePatternMatching = input.options?.usePatternMatching !== false;
    let patternResult: FulfillmentResult | undefined;
    if (usePatternMatching) {
      patternResult = checkFulfillmentPattern(refSpan, searchText, effectiveNouns, effectiveSynonyms);
      if (patternResult.status === 'fulfilled') {
        return { found: true, method: 'pattern', fulfillmentResult: patternResult };
      }
    } else {
      console.log('[Reference] Pattern matching disabled, skipping pattern check');
      // Create a default pattern result for consistency
      patternResult = {
        status: 'unfulfilled',
        method: 'pattern',
        confidence: 0.0
      };
    }
    
    // Step 2: Async semantic similarity and NLI (if enabled)
    if (useSemanticFeatures) {
      try {
        // Use combined scoring if enabled, otherwise use hierarchical
        const useCombined = input.options?.useCombinedScoring === true;
        const asyncResult = useCombined
          ? await checkFulfillmentCombined(
              refSpan,
              searchText,
              effectiveNouns,
              effectiveSynonyms,
              {
                similarityThreshold: input.options?.similarityThreshold,
                useSemanticSimilarity: input.options?.useSemanticSimilarity !== false,
                useNLIEntailment: input.options?.useNLIEntailment !== false,
                usePatternMatching: input.options?.usePatternMatching !== false,
                combineWeights: input.options?.combineWeights,
                combinedThreshold: input.options?.combinedThreshold,
                // Context-aware matching options
                useChunkedMatching: input.options?.useChunkedMatching,
                chunkSize: input.options?.chunkSize,
                chunkOverlap: input.options?.chunkOverlap,
                useSentenceLevel: input.options?.useSentenceLevel,
                usePhraseLevel: input.options?.usePhraseLevel,
                useMultiHypothesis: input.options?.useMultiHypothesis
              }
            )
          : await checkFulfillment(
              refSpan,
              searchText,
              effectiveNouns,
              effectiveSynonyms,
              {
                similarityThreshold: input.options?.similarityThreshold,
                useSemanticSimilarity: input.options?.useSemanticSimilarity !== false,
                useNLIEntailment: input.options?.useNLIEntailment !== false,
                usePatternMatching: input.options?.usePatternMatching !== false
              }
            );
        
        // Always return the result with details, even if unfulfilled, so we can show scores
        if (asyncResult.status === 'fulfilled' || asyncResult.status === 'uncertain') {
          const method = asyncResult.method === 'semantic-similarity' ? 'semantic-similarity' as const :
                         asyncResult.method === 'nli-entailment' ? 'nli-entailment' as const :
                         asyncResult.method === 'combined' ? 'semantic-similarity' as const : // combined uses semantic-similarity for reporting
                         'pattern' as const;
          return { found: asyncResult.status === 'fulfilled', method, fulfillmentResult: asyncResult };
        } else {
          // Even if unfulfilled, return the result so we can show the scores
          const method = asyncResult.method === 'semantic-similarity' ? 'semantic-similarity' as const :
                         asyncResult.method === 'nli-entailment' ? 'nli-entailment' as const :
                         asyncResult.method === 'combined' ? 'semantic-similarity' as const :
                         'pattern' as const;
          return { found: false, method, fulfillmentResult: asyncResult };
        }
      } catch (error) {
        // Fall through to existing logic
      }
    }
    
    // Step 3: Fall back to existing synchronous logic (same as sync version)
    const searchTextLower = searchText.toLowerCase();
    const exactPattern = new RegExp(`\\b${token}s?\\b`, 'i');
    if (hasHistory && exactPattern.test(searchTextLower)) {
      return { found: true, method: 'exact', fulfillmentResult: patternResult }; // Include pattern result for details
    }
    
    // Check attachments
    const normalizedAttachments = normalizePhrase(attachmentsText);
    if (normalizedAttachments.includes(token)) {
      return { found: true, method: 'attachment', fulfillmentResult: patternResult }; // Include pattern result for details
    }
    
    // Always return pattern result for details, even if not found
    return { found: false, method: 'pattern' as const, fulfillmentResult: patternResult || {
      status: 'unfulfilled',
      method: 'pattern',
      confidence: 0.0
    } };
  };

  // Combine candidates
  const allCandidates = [
    ...candidates.map(c => ({ ...c, isForwardRef: false as const })),
    ...forwardRefCandidates.map(c => ({ 
      span: c.span, 
      head: c.head || '', 
      index: c.index, 
      isForwardRef: true as const 
    }))
  ];
  
  // Check all candidates with async fulfillment
  const uncovered: typeof allCandidates = [];
  const resolvedWithPenalty = new Set<string>();
  const fulfillmentResults = new Map<number, FulfillmentResult>();
  const candidateResults = new Map<number, { found: boolean; method?: string; confidencePenalty?: boolean; fulfillmentResult?: FulfillmentResult }>();
  
  for (const cand of allCandidates) {
    const result = await antecedentFoundAsync(cand);
    // Store the full result for later use
    candidateResults.set(cand.index, result);
    // Always store fulfillmentResult if available, even if not found, so we can show scores
    if (result.fulfillmentResult) {
      fulfillmentResults.set(cand.index, result.fulfillmentResult);
      console.log('[Reference] Stored fulfillmentResult for index', cand.index, 'method:', result.fulfillmentResult.method, 'hasDetails:', !!result.fulfillmentResult.details);
    }
    if (!result.found) {
      uncovered.push(cand);
    } else {
      if (result.confidencePenalty && cand.head) {
        resolvedWithPenalty.add(cand.head);
      }
    }
  }
  
  // Scoring and confidence (same logic as sync version)
  // Use the results we already computed instead of re-running
  let score = 0;
  if (deicticCue) score += 1;
  if (allCandidates.length > 0) score += 1;
  
  for (const cand of allCandidates) {
    const result = candidateResults.get(cand.index);
    if (result?.found) {
      if (result.method === 'exact' || result.method === 'synonym' || result.method === 'pattern' || result.method === 'semantic-similarity' || result.method === 'nli-entailment') {
        score -= 2;
      } else if (result.method === 'memory' || result.method === 'attachment') {
        score -= 1;
      }
    }
  }
  
  let confidence: 'low' | 'medium' | 'high' = 'high';
  const historyWordCount = searchableHistory.trim().split(/\s+/).length;
  if (historyWordCount < 20) {
    confidence = 'low';
  } else if (uncovered.length > 0) {
    // Check if any resolved candidates used uncertain methods
    // Use the results we already computed instead of re-running
    const resolvedResults = Array.from(candidateResults.entries())
      .filter(([idx, result]) => {
        const cand = allCandidates.find(c => c.index === idx);
        return cand && !uncovered.includes(cand) && result.found;
      })
      .map(([, result]) => result);
    const hasUncertainResolution = resolvedResults.some(result => 
      result.found && (result.method === 'synonym' || result.method === 'memory' || result.method === 'pattern')
    );
    if (hasUncertainResolution) {
      confidence = 'medium';
    }
  }
  
  if (resolvedWithPenalty.size > 0 && uncovered.length === 0) {
    confidence = confidence === 'high' ? 'medium' : 'low';
  }
  
  const shouldFlag = uncovered.length > 0 || (deicticCue && allCandidates.length === 0) || score >= 2;
  if (!shouldFlag) return;

  const issueId = createIssueId();
  const summaryMap = new Map<string, number>();
  for (const item of uncovered) {
    const key = item.span?.toLowerCase() || 'forward reference';
    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
  }
  if (deicticCue) {
    summaryMap.set('deictic cue', (summaryMap.get('deictic cue') || 0) + 1);
  }

  const summary = Array.from(summaryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([text, count]) => ({ text, count }));

  const occurrences = await Promise.all(uncovered.slice(0, 50).map(async (item) => {
    const start = item.index;
    const span = item.span || current.slice(start, start + 50);
    const end = start + span.length;
    // Get fulfillmentResult and result from the first pass (don't re-run)
    const fulfillmentResult = fulfillmentResults.get(start);
    const result = candidateResults.get(start) || { found: false };
    
    console.log('[Reference] Building occurrence for index', start, 'fulfillmentResult:', fulfillmentResult ? 'exists' : 'missing', 'method:', fulfillmentResult?.method, 'hasDetails:', !!fulfillmentResult?.details);
    
    let fulfillmentStatus: 'fulfilled' | 'unfulfilled' | 'uncertain' = 'unfulfilled';
    if (result.found && fulfillmentResult) {
      fulfillmentStatus = fulfillmentResult.status;
    } else if (result.found) {
      fulfillmentStatus = 'fulfilled';
    } else if (fulfillmentResult) {
      // Use the status from fulfillmentResult even if not found
      fulfillmentStatus = fulfillmentResult.status;
    }
    
    return {
      text: span,
      start,
      end,
      messageIndex: scope.messageIndex,
      preview: createPreview(current, start, end),
      resolution: result.found ? 
        (result.method === 'exact' ? 'resolved-by-exact' as const :
         result.method === 'synonym' ? 'resolved-by-synonym' as const :
         result.method === 'memory' ? 'resolved-by-memory' as const :
         result.method === 'attachment' ? 'resolved-by-attachment' as const :
         'unresolved' as const) : 
        'unresolved' as const,
      fulfillmentStatus,
      fulfillmentMethod: fulfillmentResult?.method || 
        (result.method === 'pattern' ? 'pattern' :
         result.method === 'semantic-similarity' ? 'semantic-similarity' :
         result.method === 'nli-entailment' ? 'nli-entailment' : 'none'),
      fulfillmentConfidence: fulfillmentResult?.confidence || (result.found ? 0.8 : 0.0),
      fulfillmentDetails: fulfillmentResult?.details ? {
        patternScore: fulfillmentResult.details.patternScore,
        similarityScore: fulfillmentResult.details.similarityScore,
        entailmentScore: fulfillmentResult.details.entailmentScore,
        combinedScore: fulfillmentResult.details.combinedScore,
        matchedText: fulfillmentResult.details.matchedText
      } : undefined,
      term: item.head || undefined,
      turn: scope.messageIndex
    };
  }));

  if (deicticCue) {
    occurrences.push({
      text: 'deictic cue present',
      start: -1,
      end: -1,
      messageIndex: scope.messageIndex,
      preview: '',
      resolution: 'unresolved' as const,
      fulfillmentStatus: 'unfulfilled' as const,
      fulfillmentMethod: 'none' as const,
      fulfillmentConfidence: 0.0,
      fulfillmentDetails: undefined,
      term: undefined,
      turn: scope.messageIndex
    });
  }

  const firstMatch = occurrences.find((occ) => occ.start >= 0);

  const detail = `References ${summary
    .slice(0, 3)
    .map((s) => `"${s.text}"${s.count > 1 ? ` (×${s.count})` : ''}`)
    .join(', ')} without antecedent in prior context or attachments.`;

  acc.issues.push({
    id: issueId,
    code: 'MISSING_REFERENCE',
    severity: 'high',
    detail,
    evidence: {
      summary,
      occurrences,
      firstSeenAt: {
        messageIndex: scope.messageIndex,
        char: firstMatch && firstMatch.start >= 0 ? firstMatch.start : undefined
      }
    },
    scope,
    confidence
  });

  // Generate suggestions
  const heads = new Set(uncovered.map((c) => c.head).filter(Boolean));
  for (const head of heads) {
    if (head === 'report' || head === 'document' || head === 'transcript') {
      acc.suggestions = acc.suggestions || [];
      acc.suggestions.push({
        type: 'ADD_CONTEXT',
        text: 'Inline a 1–3 line summary or attach the file metadata.',
        for: issueId
      });
    } else if (head === 'list' || head === 'results') {
      acc.suggestions = acc.suggestions || [];
      acc.suggestions.push({
        type: 'ADD_CONTEXT',
        text: 'Paste the prior items or a compact summary before asking to continue.',
        for: issueId
      });
    }
  }
}

