/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { detectPII, type RedactedResult } from './detectPII';

export interface RedactPIIInput {
  prompt: string;
  options?: {
    apiKey?: string;
    apiBaseUrl?: string;
  };
}

/**
 * Redacts PII from a prompt.
 * 
 * - If an API key is provided, routes to cloud API (for better detection)
 * - If no API key is provided, uses local regex-based detection
 * 
 * @param input - The prompt to redact and optional API configuration
 * @returns Object containing original prompt, redacted prompt, and detection array
 */
export async function redactPII(input: RedactPIIInput): Promise<RedactedResult> {
  // If apiKey is provided, route to cloud API
  if (input.options?.apiKey) {
    const apiKey = input.options.apiKey;
    const baseUrl = input.options.apiBaseUrl || 'http://localhost:3000';
    const url = `${baseUrl}/api/v1/ai-analytics/redact-pii`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        prompt: input.prompt,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<RedactedResult>;
  }

  // Otherwise use local regex-based detection via detectPII
  // detectPII will:
  // 1. Detect PII using regex patterns (EMAIL, PHONE, CARD, SSN, NAME)
  // 2. Create indexed placeholders like [EMAIL_1], [EMAIL_2], [NAME_1], etc.
  // 3. Replace detected PII values with these placeholders in the prompt
  // 4. Return RedactedResult with the same format as the cloud API
  return detectPII(input.prompt);
}

