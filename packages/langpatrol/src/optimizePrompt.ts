/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

export interface OptimizeInput {
  prompt: string;
  model?: string;
  options?: {
    apiKey?: string;
    apiBaseUrl?: string;
  };
}

export interface OptimizeResponse {
  optimized_prompt: string;
  ratio: string;
  origin_tokens: number;
  optimized_tokens: number;
}

/**
 * Call the cloud API to optimize/compress a prompt.
 * This endpoint is available only with an API key.
 */
export async function optimizePrompt(input: OptimizeInput): Promise<OptimizeResponse> {
  if (!input.options?.apiKey) {
    throw new Error('optimizePrompt requires an apiKey (cloud-only).');
  }

  const apiKey = input.options.apiKey;
  const baseUrl = input.options.apiBaseUrl || 'http://localhost:3000';
  const url = `${baseUrl}/api/v1/compression/optimize`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      model: input.model,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<OptimizeResponse>;
}


