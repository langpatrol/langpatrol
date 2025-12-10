/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { analyzePrompt, type AnalyzeInput } from '../index';

/**
 * Example adapter for LangChain
 * Runnable middleware that calls analyzePrompt before invoking the chain
 */
export async function analyzeBeforeChain(
  messages: Array<{ role: string; content: string }>,
  model: string
) {
  const report = await analyzePrompt({
    messages: messages as AnalyzeInput['messages'],
    model
  });

  if (report.issues.length > 0) {
    console.warn('LangPatrol detected issues:', report.issues);
  }

  return report;
}

