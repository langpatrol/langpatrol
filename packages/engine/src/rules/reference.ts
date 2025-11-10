/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Issue, Report, Suggestion } from '../types';
import { 
  NP_LEXICON, 
  DEICTIC_CUES, 
  DEF_NP,
  getAllTaxonomyNouns,
  getSynonyms,
  SYNONYMS
} from '@langpatrol/rules';
import { joinMessages } from '../util/text';
import { createIssueId, createPreview } from '../util/reporting';
import { normalizeNoun, normalizePhrase } from '../util/normalize';
import { detectForwardReferences, type ForwardRefMatch } from '../util/forwardRef';
import { checkFulfillmentPattern, checkFulfillment, type FulfillmentResult } from '../util/fulfillmentChecker';
import { isSemanticSimilarityAvailable } from '../util/semanticSimilarity';
import { isNLIEntailmentAvailable } from '../util/nliEntailment';

export function run(input: AnalyzeInput, acc: Report): void {
  const messages = input.messages || [];
  const scope: { type: 'prompt' | 'messages'; messageIndex?: number } =
    messages.length > 0
      ? { type: 'messages', messageIndex: messages.length - 1 }
      : { type: 'prompt' };

  // Handle both prompt-only and messages scenarios
  let current: string;
  let historyText: string;

  if (messages.length > 0) {
    // Multi-turn conversation
    current = messages[messages.length - 1]?.content || '';
    const history = messages.slice(0, -1);
    historyText = joinMessages(history);
  } else if (input.prompt) {
    // Single prompt without messages
    current = input.prompt;
    historyText = '';
  } else {
    // No input to analyze
    return;
  }

  // Phase 2: Build effective noun lexicon (taxonomy + user extensions)
  const effectiveNouns = new Set(getAllTaxonomyNouns());
  if (input.options?.referenceHeads) {
    input.options.referenceHeads.forEach(noun => effectiveNouns.add(noun.toLowerCase()));
  }
  
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
  let searchableHistory = historyText;
  if (messages.length > 0 && windowMessages) {
    const historyMessages = messages.slice(0, -1);
    const windowedMessages = windowMessages > 0 
      ? historyMessages.slice(-windowMessages)
      : historyMessages;
    searchableHistory = joinMessages(windowedMessages);
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

  // Check if semantic/NLI features are enabled
  const useSemanticFeatures = 
    input.options?.similarityThreshold !== undefined ||
    input.options?.useSemanticSimilarity === true ||
    input.options?.useNLIEntailment === true;
  
  const semanticAvailable = useSemanticFeatures && 
    (isSemanticSimilarityAvailable() || isNLIEntailmentAvailable());

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
      return { found: true, method: 'exact' };
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
          const contextAfter = searchTextLower.slice(matchIndex, Math.min(searchTextLower.length, matchIndex + 30));
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
      return { found: true, method: 'attachment' };
    }
    for (const syn of synonyms) {
      if (normalizedAttachments.includes(syn)) {
        return { found: true, method: 'attachment' };
      }
    }
    
    return { found: false };
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
    if (result.found) {
      if (result.confidencePenalty && cand.head) {
        resolvedWithPenalty.add(cand.head);
      }
      if (result.fulfillmentResult) {
        fulfillmentResults.set(cand.index, result.fulfillmentResult);
      }
    }
  }
  
  // Also check forward references for fulfillment in future content
  for (const fref of forwardRefCandidates) {
    if (fref.head) {
      const cand = { span: fref.span, head: fref.head, index: fref.index, isForwardRef: true };
      const result = antecedentFound(cand);
      if (result.found && result.fulfillmentResult) {
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
  
  // If semantic features are not enabled, use the sync version
  if (!useSemanticFeatures || (!isSemanticSimilarityAvailable() && !isNLIEntailmentAvailable())) {
    run(input, acc);
    return;
  }

  // Otherwise, use async version with semantic/NLI checking
  const messages = input.messages || [];
  const scope: { type: 'prompt' | 'messages'; messageIndex?: number } =
    messages.length > 0
      ? { type: 'messages', messageIndex: messages.length - 1 }
      : { type: 'prompt' };

  // Handle both prompt-only and messages scenarios
  let current: string;
  let historyText: string;

  if (messages.length > 0) {
    current = messages[messages.length - 1]?.content || '';
    const history = messages.slice(0, -1);
    historyText = joinMessages(history);
  } else if (input.prompt) {
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
  
  let searchableHistory = historyText;
  if (messages.length > 0 && windowMessages) {
    const historyMessages = messages.slice(0, -1);
    const windowedMessages = windowMessages > 0 
      ? historyMessages.slice(-windowMessages)
      : historyMessages;
    searchableHistory = joinMessages(windowedMessages);
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

  // Find candidates (same as sync version)
  const candidates: Array<{ span: string; head: string; index: number }> = [];
  const regex = new RegExp(DEF_NP.source, DEF_NP.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(current)) !== null) {
    const head = match[2].toLowerCase();
    const normalizedHead = normalizeNoun(head);
    if (effectiveNouns.has(head) || effectiveNouns.has(normalizedHead)) {
      candidates.push({ span: match[0], head: normalizedHead, index: match.index });
    }
  }

  // Detect forward references
  const forwardRefs = detectForwardReferences(current);
  const forwardRefCandidates: Array<{ span: string; head?: string; index: number; isForwardRef: boolean }> = [];
  
  for (const fref of forwardRefs) {
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

  const deicticCue = DEICTIC_CUES.test(current);
  if (candidates.length === 0 && forwardRefCandidates.length === 0 && !deicticCue) return;

  const hasHistory = searchableHistory.trim().split(/\s+/).length > 40;
  const attachmentsText = (input.attachments || [])
    .map((a) => normalizePhrase(a.name || a.type))
    .join(' ');

  // Async antecedent check with hierarchical fulfillment
  const antecedentFoundAsync = async (cand: { span?: string; head: string; index: number; isForwardRef?: boolean }): Promise<{ found: boolean; method?: 'exact' | 'synonym' | 'memory' | 'attachment' | 'pattern' | 'semantic-similarity' | 'nli-entailment'; confidencePenalty?: boolean; fulfillmentResult?: FulfillmentResult }> => {
    const token = cand.head;
    const searchText = normalizePhrase(searchableHistory);
    const refSpan = cand.span || current.slice(cand.index, cand.index + 50);
    
    // Step 1: Fast synchronous pattern matching
    const patternResult = checkFulfillmentPattern(refSpan, searchText, effectiveNouns, effectiveSynonyms);
    if (patternResult.status === 'fulfilled') {
      return { found: true, method: 'pattern', fulfillmentResult: patternResult };
    }
    
    // Step 2: Async semantic similarity and NLI (if enabled)
    if (useSemanticFeatures) {
      try {
        const asyncResult = await checkFulfillment(
          refSpan,
          searchText,
          effectiveNouns,
          effectiveSynonyms,
          {
            similarityThreshold: input.options?.similarityThreshold,
            useSemanticSimilarity: input.options?.useSemanticSimilarity !== false,
            useNLIEntailment: input.options?.useNLIEntailment !== false
          }
        );
        
        if (asyncResult.status === 'fulfilled') {
          const method = asyncResult.method === 'semantic-similarity' ? 'semantic-similarity' as const :
                         asyncResult.method === 'nli-entailment' ? 'nli-entailment' as const :
                         'pattern' as const;
          return { found: true, method, fulfillmentResult: asyncResult };
        }
      } catch (error) {
        // Fall through to existing logic
      }
    }
    
    // Step 3: Fall back to existing synchronous logic (same as sync version)
    const searchTextLower = searchText.toLowerCase();
    const exactPattern = new RegExp(`\\b${token}s?\\b`, 'i');
    if (hasHistory && exactPattern.test(searchTextLower)) {
      return { found: true, method: 'exact' };
    }
    
    // Check attachments
    const normalizedAttachments = normalizePhrase(attachmentsText);
    if (normalizedAttachments.includes(token)) {
      return { found: true, method: 'attachment' };
    }
    
    return { found: false };
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
  
  for (const cand of allCandidates) {
    const result = await antecedentFoundAsync(cand);
    if (!result.found) {
      uncovered.push(cand);
    } else {
      if (result.confidencePenalty && cand.head) {
        resolvedWithPenalty.add(cand.head);
      }
      if (result.fulfillmentResult) {
        fulfillmentResults.set(cand.index, result.fulfillmentResult);
      }
    }
  }
  
  // Scoring and confidence (same logic as sync version)
  let score = 0;
  if (deicticCue) score += 1;
  if (allCandidates.length > 0) score += 1;
  
  for (const cand of allCandidates) {
    const result = await antecedentFoundAsync(cand);
    if (result.found) {
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
    const resolvedResults = new Map<number, { found: boolean; method?: string }>();
    for (const cand of allCandidates) {
      if (!uncovered.includes(cand)) {
        const result = await antecedentFoundAsync(cand);
        resolvedResults.set(cand.index, result);
      }
    }
    const hasUncertainResolution = Array.from(resolvedResults.values()).some(result => 
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
    const fulfillmentResult = fulfillmentResults.get(start);
    const result = await antecedentFoundAsync(item);
    
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

