/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Issue, Report, Suggestion } from '../types';
import { extractText } from '../util/text';
import { hasJsonKeywords, hasProseAfterJsonPattern } from '../util/schema';

export function run(input: AnalyzeInput, acc: Report): void {
  if (!input.schema) return;

  const text = extractText(input);
  if (!text) return;

  if (!hasJsonKeywords(text)) {
    acc.issues.push({
      code: 'SCHEMA_RISK',
      severity: 'high',
      detail: 'Schema provided but prompt does not request JSON output.'
    });
    return;
  }

  if (hasProseAfterJsonPattern(text)) {
    acc.issues.push({
      code: 'SCHEMA_RISK',
      severity: 'high',
      detail: 'Prompt expects JSON but allows commentary after the JSON block.'
    });

    acc.suggestions.push({
      type: 'ENFORCE_JSON',
      text: 'Respond with a single JSON object that validates against the provided schema. Do not include any text outside the JSON.'
    });
  }
}

