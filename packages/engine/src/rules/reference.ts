/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Issue, Report, Suggestion } from '../types';
import { NP_LEXICON, DEICTIC_CUES, DEF_NP } from '@langpatrol/rules';
import { joinMessages } from '../util/text';

export function run(input: AnalyzeInput, acc: Report): void {
  const messages = input.messages || [];
  
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

  const candidates: Array<{ span: string; head: string }> = [];

  // Create a fresh regex instance to avoid lastIndex issues
  const regex = new RegExp(DEF_NP.source, DEF_NP.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(current)) !== null) {
    const head = match[2].toLowerCase();
    if (NP_LEXICON.has(head)) {
      candidates.push({ span: match[0], head });
    }
  }

  const deicticCue = DEICTIC_CUES.test(current);
  if (candidates.length === 0 && !deicticCue) return;

  const hasHistory = historyText.trim().split(/\s+/).length > 40;
  const attachmentsText = (input.attachments || [])
    .map((a) => (a.name || a.type).toLowerCase())
    .join(' ');

  const antecedentFound = (cand: { head: string }): boolean => {
    const h = historyText.toLowerCase();
    const token = cand.head;
    const re = new RegExp(`\\b${token}s?\\b`);
    return (hasHistory && re.test(h)) || attachmentsText.includes(token);
  };

  const uncovered = candidates.filter((c) => !antecedentFound(c));
  const shouldFlag =
    (uncovered.length > 0 || deicticCue) && !candidates.some(antecedentFound);

  if (!shouldFlag) return;

  const evidence = [
    ...uncovered.map((c) => c.span),
    ...(deicticCue ? ['deictic cue present'] : [])
  ];

  acc.issues.push({
    code: 'MISSING_REFERENCE',
    severity: 'high',
    detail: `Reference${uncovered.length > 1 ? 's' : ''} ${uncovered.map((c) => `"${c.span}"`).join(', ')} without antecedent in prior context or attachments.`,
    evidence
  });

  // Generate targeted suggestions based on head noun
  const heads = new Set(uncovered.map((c) => c.head));
  for (const head of heads) {
    if (head === 'report' || head === 'document' || head === 'transcript') {
      acc.suggestions.push({
        type: 'ADD_CONTEXT',
        text: 'Inline a 1–3 line summary or attach the file metadata.'
      });
    } else if (head === 'list' || head === 'results') {
      acc.suggestions.push({
        type: 'ADD_CONTEXT',
        text: 'Paste the prior items or a compact summary before asking to continue.'
      });
    }
  }
}

