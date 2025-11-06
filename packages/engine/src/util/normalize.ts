/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

/**
 * Simple singularization (handles common cases)
 * For production, consider using a library like 'pluralize', but keeping it lightweight for now
 */
function singularize(word: string): string {
  const lower = word.toLowerCase();
  
  // Common plural patterns
  if (lower.endsWith('ies') && lower.length > 3) {
    return lower.slice(0, -3) + 'y';
  }
  if (lower.endsWith('es') && lower.length > 2) {
    // words ending in -es (boxes, classes, tables) -> remove es
    // But check for special cases first
    if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes') || lower.endsWith('ches') || lower.endsWith('shes')) {
      return lower.slice(0, -2);
    }
    // For words like "tables", "files" -> remove "s" only
    if (lower.endsWith('les') || lower.endsWith('res') || lower.endsWith('nes')) {
      return lower.slice(0, -1);
    }
    return lower.slice(0, -2);
  }
  if (lower.endsWith('s') && lower.length > 1 && !lower.endsWith('ss')) {
    return lower.slice(0, -1);
  }
  
  return lower;
}

/**
 * Normalize text for matching: lowercase, singularize, strip punctuation
 */
export function normalizeNoun(text: string): string {
  // Lowercase
  let normalized = text.toLowerCase();
  
  // Strip common punctuation
  normalized = normalized.replace(/[.,;:!?()[\]{}'"]/g, '');
  
  // Singularize
  normalized = singularize(normalized.trim());
  
  return normalized;
}

/**
 * Normalize a phrase (keeps word boundaries)
 */
export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

