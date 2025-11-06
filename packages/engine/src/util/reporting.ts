/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

export function createIssueId(prefix = 'iss'): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

export function createPreview(text: string, start: number, end: number, radius = 40): string {
  const safeStart = Math.max(0, start - radius);
  const safeEnd = Math.min(text.length, end + radius);
  let snippet = text.slice(safeStart, safeEnd);
  snippet = snippet.replace(/\s+/g, ' ').trim();
  if (safeStart > 0) {
    snippet = `…${snippet}`;
  }
  if (safeEnd < text.length) {
    snippet = `${snippet}…`;
  }
  return snippet;
}

export function createTraceId(prefix = 'lp'): string {
  const timestamp = new Date().toISOString();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

