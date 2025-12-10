/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { encodingForModel, getEncoding, TiktokenModel } from 'js-tiktoken';

const MODEL_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16384,
  'gpt-3.5-turbo-16k': 16384
};

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
};

export function getModelWindow(model?: string): number {
  if (!model) return 16384; // default
  return MODEL_WINDOWS[model] ?? 16384;
}

export function getModelPricing(model?: string): { input: number; output: number } | null {
  if (!model) return null;
  return MODEL_PRICING[model] ?? null;
}

export type TokenEstimationMode = 'auto' | 'cheap' | 'exact' | 'off';

export type TokenEstimate = {
  tokens: number;
  method: 'off' | 'cheap' | 'cheap_over' | 'exact' | 'exact_boundary';
};

/**
 * Cheap token estimation: ~4 chars ≈ 1 token for English prose
 * p50 ~0.1 ms even for huge strings
 */
export function cheapTokensApprox(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Exact tokenization using BPE tokenizer
 * Slow but precise - use only when needed
 */
export function exactTokens(text: string, model?: string): number {
  try {
    let encoding;
    if (model) {
      try {
        encoding = encodingForModel(model as TiktokenModel);
      } catch {
        encoding = getEncoding('cl100k_base');
      }
    } else {
      encoding = getEncoding('cl100k_base');
    }
    return encoding.encode(text).length;
  } catch {
    // Fallback: rough estimate of 0.75 tokens per word
    return Math.ceil(text.split(/\s+/).length * 0.75);
  }
}

/**
 * Auto mode: cheap for small inputs, exact only if near limit
 * Two-level rule: cheap estimate first, only use exact if near boundary
 */
export function estimateTokensAuto(
  text: string,
  model?: string,
  mode: TokenEstimationMode = 'auto'
): TokenEstimate {
  if (mode === 'off') {
    return { tokens: 0, method: 'off' };
  }

  if (mode === 'cheap') {
    return { tokens: cheapTokensApprox(text), method: 'cheap' };
  }

  if (mode === 'exact') {
    return { tokens: exactTokens(text, model), method: 'exact' };
  }

  // Auto mode: two-level rule
  const window = getModelWindow(model);
  const est = cheapTokensApprox(text);

  // Fast path: well below limit - use cheap estimate
  if (est < 0.6 * window) {
    return { tokens: est, method: 'cheap' };
  }

  // Fast path: well above limit - flag overage without exact count
  if (est > 1.1 * window) {
    return { tokens: est, method: 'cheap_over' };
  }

  // Near boundary: use exact tokenization for precision
  return { tokens: exactTokens(text, model), method: 'exact_boundary' };
}

/**
 * Legacy function for backward compatibility
 * Uses exact tokenization by default
 */
export function estimateTokens(text: string, model?: string): number {
  return exactTokens(text, model);
}

export function estimateCost(inputTokens: number, outputTokens: number, model?: string): number | null {
  const pricing = getModelPricing(model);
  if (!pricing) return null;
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

