/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Report } from '../types';
import { extractText } from '../util/text';
import { hasJsonKeywords, hasProseAfterJsonPattern } from '../util/schema';
import { createIssueId, createPreview } from '../util/reporting';

export function run(input: AnalyzeInput, acc: Report): void {
  if (!input.schema) return;

  const text = extractText(input);
  if (!text) return;

  const jsonCue = hasJsonKeywords(text);
  const proseAfterJson = hasProseAfterJsonPattern(text);

  if (!jsonCue || !proseAfterJson) return;

  const issueId = createIssueId();

  const jsonMatch = text.match(/json[^.\n]{0,120}/i);
  const proseMatch = text.match(/(notes|commentary|explanation|discussion)[^.\n]{0,120}/i);

  const occurrences = [];
  if (jsonMatch && jsonMatch.index != null) {
    const start = jsonMatch.index;
    const end = start + jsonMatch[0].length;
    occurrences.push({
      text: jsonMatch[0],
      start,
      end,
      preview: createPreview(text, start, end)
    });
  }
  if (proseMatch && proseMatch.index != null) {
    const start = proseMatch.index;
    const end = start + proseMatch[0].length;
    occurrences.push({
      text: proseMatch[0],
      start,
      end,
      preview: createPreview(text, start, end)
    });
  }

  acc.issues.push({
    id: issueId,
    code: 'SCHEMA_RISK',
    severity: 'medium',
    detail: 'Prompt mixes strict JSON instructions with additional prose after the schema.',
    evidence: {
      summary: [
        { text: 'json keywords', count: 1 },
        { text: 'prose after json request', count: 1 }
      ],
      occurrences
    },
    scope: input.messages && input.messages.length > 0
      ? { type: 'messages', messageIndex: input.messages.length - 1 }
      : { type: 'prompt' },
    confidence: 'medium'
  });

  acc.suggestions = acc.suggestions || [];
  acc.suggestions.push({
    type: 'ENFORCE_JSON',
    text: 'Move commentary into structured fields or drop it when requesting strict JSON.',
    for: issueId
  });
}

