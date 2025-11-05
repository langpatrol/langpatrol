/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { Msg } from '../types';

export function joinMessages(messages: Msg[]): string {
  return messages.map((m) => m.content).join('\n');
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function extractText(input: { prompt?: string; messages?: Msg[] }): string {
  if (input.prompt) return input.prompt;
  if (input.messages && input.messages.length > 0) {
    return joinMessages(input.messages);
  }
  return '';
}

