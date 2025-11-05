/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Issue, Report, Suggestion } from '../types';
import { extractText } from '../util/text';
import {
  estimateTokensAuto,
  getModelWindow,
  getModelPricing,
  estimateCost,
  type TokenEstimate
} from '../util/tokenize';
import { joinMessages } from '../util/text';

export function run(input: AnalyzeInput, acc: Report): void {
  if (!input.model) return;

  const text = extractText(input);
  if (!text) return;

  // Early bail on giant inputs by character length
  const maxChars = input.options?.maxChars ?? 120_000;
  if (text.length > maxChars) {
    acc.issues.push({
      code: 'TOKEN_OVERAGE',
      severity: 'medium',
      detail: `Input text (${text.length.toLocaleString()} chars) exceeds character limit (${maxChars.toLocaleString()}). Skipping exact tokenization.`
    });
    acc.cost = { estInputTokens: Math.ceil(text.length / 4) }; // cheap estimate
    return;
  }

  // Get token estimation mode (default: auto)
  const tokenMode = input.options?.tokenEstimation || 'auto';

  const messages = input.messages || [];
  let totalEstimate: TokenEstimate;
  let estInputTokens: number;

  if (messages.length > 0) {
    // Multi-turn: estimate each message
    const estimates = messages.map((m) => estimateTokensAuto(m.content, input.model, tokenMode));
    estInputTokens = estimates.reduce((sum, e) => sum + e.tokens, 0);
    // Use the method from the last estimate (or first if needed)
    totalEstimate = estimates[estimates.length - 1] || { tokens: 0, method: 'off' };
  } else {
    // Single prompt
    totalEstimate = estimateTokensAuto(text, input.model, tokenMode);
    estInputTokens = totalEstimate.tokens;
  }

  const window = getModelWindow(input.model);
  const maxInputTokens = input.options?.maxInputTokens || window;

  if (estInputTokens > maxInputTokens || estInputTokens > window) {
    const methodNote =
      totalEstimate.method === 'cheap' || totalEstimate.method === 'cheap_over'
        ? ' (estimated)'
        : '';
    const detail = `Estimated${methodNote} ${estInputTokens.toLocaleString()} input tokens exceeds ${Math.min(maxInputTokens, window).toLocaleString()} token limit for ${input.model}.`;

    acc.issues.push({
      code: 'TOKEN_OVERAGE',
      severity: 'medium',
      detail
    });

    acc.suggestions.push({
      type: 'TRIM_CONTEXT',
      text: 'Consider summarizing prior messages or removing unnecessary context.'
    });
  }

  // Cost estimation (only if we have pricing and actual tokens)
  const pricing = getModelPricing(input.model);
  if (pricing && tokenMode !== 'off') {
    const estOutputTokens = Math.ceil(estInputTokens * 0.5); // rough estimate
    const estUSD = estimateCost(estInputTokens, estOutputTokens, input.model);
    if (estUSD) {
      acc.cost = {
        estInputTokens,
        estUSD
      };

      if (input.options?.maxCostUSD && estUSD > input.options.maxCostUSD) {
        acc.issues.push({
          code: 'TOKEN_OVERAGE',
          severity: 'medium',
          detail: `Estimated cost $${estUSD.toFixed(4)} exceeds max cost $${input.options.maxCostUSD}.`
        });
      }
    }
  } else {
    acc.cost = { estInputTokens };
  }
}

