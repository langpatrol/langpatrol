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

function findOccurrences(pattern: RegExp, text: string) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const results: Array<{ text: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    results.push({ text: match[0], start, end });
  }
  return results;
}

export function run(input: AnalyzeInput, acc: Report): void {
  const text = extractText(input);
  if (!text) return;

  const scope = input.prompt ? { type: 'prompt' as const } : { type: 'messages' as const };

  const verboseMatches = findOccurrences(VERBOSE_PATTERNS, text);
  const conciseMatches = findOccurrences(CONCISE_PATTERNS, text);
  const jsonOnlyMatches = findOccurrences(JSON_ONLY_PATTERNS, text);
  const explanatoryMatches = findOccurrences(EXPLANATORY_PATTERNS, text);

  const conflicts: Array<{
    bucket: 'verbosity' | 'format';
    a: { text: string; start: number; end: number };
    b: { text: string; start: number; end: number };
  }> = [];

  if (verboseMatches.length > 0 && conciseMatches.length > 0) {
    conflicts.push({
      bucket: 'verbosity',
      a: verboseMatches[0],
      b: conciseMatches[0]
    });
  }

  if (jsonOnlyMatches.length > 0 && explanatoryMatches.length > 0) {
    conflicts.push({
      bucket: 'format',
      a: jsonOnlyMatches[0],
      b: explanatoryMatches[0]
    });
  }

  if (conflicts.length === 0) return;

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

  const detail = `Conflicting directives: ${detailParts.join('; ')}.`;

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
    confidence: 'medium'
  });

  acc.suggestions = acc.suggestions || [];
  if (conflicts.some((c) => c.bucket === 'verbosity')) {
    acc.suggestions.push({
      type: 'TIGHTEN_INSTRUCTION',
      text: 'Remove either the “concise” or “step-by-step” directive to avoid contradictions.',
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
}

