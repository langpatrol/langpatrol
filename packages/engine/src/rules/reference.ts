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

  const deicticCue = DEICTIC_CUES.test(current);
  if (candidates.length === 0 && !deicticCue) return;

  const hasHistory = searchableHistory.trim().split(/\s+/).length > 40;
  const attachmentsText = (input.attachments || [])
    .map((a) => normalizePhrase(a.name || a.type))
    .join(' ');

  // Phase 2: Enhanced antecedent check with normalization and synonym matching
  const antecedentFound = (cand: { head: string; index: number }): { found: boolean; method?: 'exact' | 'synonym' | 'memory' | 'attachment' } => {
    const token = cand.head; // already normalized
    const searchText = normalizePhrase(searchableHistory);
    const searchTextLower = searchText.toLowerCase();
    
    // 1. Exact match in history (normalized)
    const exactPattern = new RegExp(`\\b${token}s?\\b`, 'i');
    if (hasHistory && exactPattern.test(searchTextLower)) {
      return { found: true, method: 'exact' };
    }
    
    // 2. Synonym match in history
    const synonyms = effectiveSynonyms[token] || new Set([token]);
    for (const syn of synonyms) {
      const synPattern = new RegExp(`\\b${syn}s?\\b`, 'i');
      if (hasHistory && synPattern.test(searchTextLower)) {
        return { found: true, method: 'synonym' };
      }
    }
    
    // 3. Check noun memory from history (was this noun mentioned earlier as a bare mention?)
    if (nounMemory.has(token)) {
      return { found: true, method: 'memory' };
    }
    
    // 4. Check synonyms in noun memory
    for (const syn of synonyms) {
      if (nounMemory.has(syn)) {
        return { found: true, method: 'synonym' };
      }
    }
    
    // 5. Check if this specific "the X" appears AFTER a bare mention of X in current text
    // (sequential order check - bare mention must come BEFORE "the X")
    const textBefore = current.slice(0, cand.index);
    const bareBefore = findBareMentions(textBefore);
    if (bareBefore.has(token)) {
      return { found: true, method: 'memory' };
    }
    
    // Check synonyms in text before
    for (const syn of synonyms) {
      if (bareBefore.has(syn)) {
        return { found: true, method: 'synonym' };
      }
    }
    
    // 6. Check attachments (normalized)
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

  const uncovered = candidates.filter((c) => !antecedentFound(c).found);
  
  // Phase 2: Scoring system
  // Score = +1 deictic, +1 definite NP with known head, +1 instruction like continue
  //        -2 if antecedent found by exact/synonym, -1 if found by embedding (future)
  let score = 0;
  if (deicticCue) score += 1;
  if (candidates.length > 0) score += 1;
  // Subtract for resolved candidates
  for (const cand of candidates) {
    const result = antecedentFound(cand);
    if (result.found) {
      if (result.method === 'exact' || result.method === 'synonym') {
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
    const resolvedCandidates = candidates.filter(c => antecedentFound(c).found);
    const hasUncertainResolution = resolvedCandidates.some(cand => {
      const result = antecedentFound(cand);
      return result.method === 'synonym' || result.method === 'memory';
    });
    if (hasUncertainResolution) {
      confidence = 'medium';
    }
  }
  
  // Flag if we have any uncovered references (these lack antecedents)
  // OR if we have deictic cues without any candidates that have antecedents
  // OR if score >= 2 (scoring threshold)
  const shouldFlag = uncovered.length > 0 || (deicticCue && candidates.length === 0) || score >= 2;

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
    const end = start + item.span.length;
    return {
      text: item.span,
      start,
      end,
      messageIndex: scope.messageIndex,
      preview: createPreview(current, start, end),
      resolution: 'unresolved' as const
    };
  });

  if (deicticCue) {
    occurrences.push({
      text: 'deictic cue present',
      start: -1,
      end: -1,
      messageIndex: scope.messageIndex,
      preview: undefined
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

