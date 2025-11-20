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

/**
 * Extract full text from input, combining prompt and all messages.
 * If both prompt and messages are provided, combines them (prompt + messages).
 * This ensures all rules analyze the complete conversation context.
 */
export function extractText(input: { prompt?: string; messages?: Msg[] }): string {
  const parts: string[] = [];
  
  // Add prompt if provided
  if (input.prompt) {
    parts.push(input.prompt);
  }
  
  // Add all messages if provided
  if (input.messages && input.messages.length > 0) {
    const messagesText = joinMessages(input.messages);
    if (messagesText) {
      parts.push(messagesText);
    }
  }
  
  // Combine prompt and messages with newline separator
  return parts.join('\n');
}

/**
 * Get the current prompt text to analyze.
 * If messages are provided, returns the last message content (current prompt).
 * Otherwise, returns the prompt string.
 * This is useful when you want to analyze the current prompt in the context of chat history.
 */
export function getCurrentPrompt(input: { prompt?: string; messages?: Msg[] }): string {
  if (input.messages && input.messages.length > 0) {
    // Return the last message (current prompt) when messages are provided
    return input.messages[input.messages.length - 1]?.content || '';
  }
  return input.prompt || '';
}

/**
 * Get the full text including all messages for analysis.
 * When messages are provided, returns all messages joined.
 * Otherwise, returns the prompt string.
 */
export function getFullText(input: { prompt?: string; messages?: Msg[] }): string {
  return extractText(input);
}

