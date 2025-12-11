/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { analyzePrompt, type AnalyzeInput } from '../index';

/**
 * Example adapter for Vercel AI SDK
 * Run analyzePrompt before invoking your model
 */
export async function guardedCall(messages: Array<{ role: string; content: string }>, model: string) {
  const report = await analyzePrompt({
    messages: messages as AnalyzeInput['messages'],
    model
  });

  if (report.issues.find((i) => i.code === 'TOKEN_OVERAGE')) {
    // Summarize or trim, then proceed
    console.warn('Token overage detected, consider trimming context');
  }

  if (report.issues.length > 0) {
    console.warn('Prompt issues detected:', report.issues);
  }

  // Then call your model
  // return await openai.chat.completions.create({ messages, model });
}

