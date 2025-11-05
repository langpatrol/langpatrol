/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Issue, Report } from '../types';
import { VERBOSE_PATTERNS, CONCISE_PATTERNS, JSON_ONLY_PATTERNS, EXPLANATORY_PATTERNS } from '@langpatrol/rules';
import { extractText } from '../util/text';

export function run(input: AnalyzeInput, acc: Report): void {
  const text = extractText(input);
  if (!text) return;

  const conflicts: string[] = [];

  if (VERBOSE_PATTERNS.test(text) && CONCISE_PATTERNS.test(text)) {
    conflicts.push('verbosity');
  }

  if (JSON_ONLY_PATTERNS.test(text) && EXPLANATORY_PATTERNS.test(text)) {
    conflicts.push('json_vs_explanation');
  }

  if (conflicts.length > 0) {
    const detail = conflicts.includes('verbosity')
      ? "Prompt requests 'concise' and 'step by step' simultaneously."
      : "Prompt requests 'JSON only' and 'explanation' simultaneously.";

    acc.issues.push({
      code: 'CONFLICTING_INSTRUCTION',
      severity: 'medium',
      detail,
      evidence: conflicts
    });
  }
}

