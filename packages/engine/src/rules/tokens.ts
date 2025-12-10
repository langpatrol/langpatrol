/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import type { AnalyzeInput, Report } from '../types';
import { extractText } from '../util/text';
import {
  estimateTokensAuto,
  getModelWindow,
  getModelPricing,
  estimateCost,
  type TokenEstimate
} from '../util/tokenize';
import { createIssueId } from '../util/reporting';

export function run(input: AnalyzeInput, acc: Report): void {
  if (!input.model) return;

  const text = extractText(input);
  if (!text) return;

  const charCount = text.length;

  // Early bail on giant inputs by character length
  const maxChars = input.options?.maxChars ?? 120_000;
  if (charCount > maxChars) {
    const issueId = createIssueId();
    const window = getModelWindow(input.model);

    acc.issues.push({
      id: issueId,
      code: 'TOKEN_OVERAGE',
      severity: 'medium',
      detail: `Input text (${charCount.toLocaleString()} chars) exceeds character limit (${maxChars.toLocaleString()}). Skipping exact tokenization.`,
      evidence: {
        summary: [{ text: 'char-limit', count: 1 }],
        occurrences: [
          {
            text: `charCount=${charCount.toLocaleString()}`,
            start: 0,
            end: 0
          }
        ]
      },
      scope: input.prompt ? { type: 'prompt' } : { type: 'messages' },
      confidence: 'medium'
    });

    acc.suggestions = acc.suggestions || [];
    acc.suggestions.push({
      type: 'TRIM_CONTEXT',
      text: 'Context exceeds soft limit. Summarize older turns or drop large traces before sending.',
      for: issueId
    });

    acc.cost = {
      estInputTokens: Math.ceil(charCount / 4),
      charCount,
      method: 'char_estimate'
    };

    acc.meta = {
      ...acc.meta,
      contextWindow: window!
    };
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
    // Use method of most conservative estimate (exact_boundary > exact > cheap_over > cheap > off)
    const methodPriority: Record<TokenEstimate['method'], number> = {
      off: 0,
      cheap: 1,
      cheap_over: 2,
      exact: 3,
      exact_boundary: 4
    };
    totalEstimate = estimates.reduce((prev, curr) =>
      methodPriority[curr.method] > methodPriority[prev.method] ? curr : prev
    );
  } else {
    // Single prompt
    totalEstimate = estimateTokensAuto(text, input.model, tokenMode);
    estInputTokens = totalEstimate.tokens;
  }

  const window = getModelWindow(input.model);
  const maxInputTokens = input.options?.maxInputTokens || window;

  acc.cost = {
    estInputTokens,
    charCount,
    method: totalEstimate.method
  };

  acc.meta = {
    ...acc.meta,
    contextWindow: window
  };

  if (estInputTokens > maxInputTokens || estInputTokens > window) {
    const issueId = createIssueId();
    const methodNote = totalEstimate.method ? ` (method: ${totalEstimate.method})` : '';
    const detail = `Estimated ${estInputTokens.toLocaleString()} input tokens${methodNote} exceeds ${Math.min(maxInputTokens, window).toLocaleString()} token limit for ${input.model}.`;

    acc.issues.push({
      id: issueId,
      code: 'TOKEN_OVERAGE',
      severity: 'medium',
      detail,
      evidence: {
        summary: [{ text: 'token-limit', count: 1 }],
        occurrences: [
          {
            text: `est=${estInputTokens.toLocaleString()}`,
            start: 0,
            end: 0
          }
        ],
        firstSeenAt: { char: estInputTokens }
      },
      scope: input.prompt ? { type: 'prompt' } : { type: 'messages' },
      confidence: 'medium'
    });

    acc.suggestions = acc.suggestions || [];
    acc.suggestions.push({
      type: 'TRIM_CONTEXT',
      text: 'Context exceeds soft limit. Summarize older turns or drop large traces before sending.',
      for: issueId
    });
  }

  // Cost estimation (only if we have pricing and actual tokens)
  const pricing = getModelPricing(input.model);
  if (pricing && tokenMode !== 'off') {
    const estOutputTokens = Math.ceil(estInputTokens * 0.5); // rough estimate
    const estUSD = estimateCost(estInputTokens, estOutputTokens, input.model);
    if (estUSD) {
      acc.cost.estUSD = estUSD;

      if (input.options?.maxCostUSD && estUSD > input.options.maxCostUSD) {
        const issueId = createIssueId();
        acc.issues.push({
          id: issueId,
          code: 'TOKEN_OVERAGE',
          severity: 'medium',
          detail: `Estimated cost $${estUSD.toFixed(4)} exceeds max cost $${input.options.maxCostUSD}.`,
          evidence: {
            summary: [{ text: 'cost-limit', count: 1 }],
            occurrences: [
              {
                text: `estUSD=$${estUSD.toFixed(4)}`,
                start: 0,
                end: 0
              }
            ]
          },
          scope: input.prompt ? { type: 'prompt' } : { type: 'messages' },
          confidence: 'medium'
        });

        acc.suggestions = acc.suggestions || [];
        acc.suggestions.push({
          type: 'TRIM_CONTEXT',
          text: 'Reduce prompt size or lower completion length to stay within budget.',
          for: issueId
        });
      }
    }
  }
}

