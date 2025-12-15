/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

export interface PIIDetection {
  /** Category like NAME, EMAIL, PHONE, ADDRESS, SSN, CARD, ID */
  key: string;
  /** The original PII value found in the prompt */
  value: string;
  /** The indexed placeholder used in redacted_prompt, e.g. [NAME_1], [EMAIL_2] */
  placeholder: string;
  /** Index within this category (1-based) */
  index: number;
}

export interface RedactedResult {
  prompt: string;
  redacted_prompt: string;
  detection: PIIDetection[];
}

/**
 * Detects and redacts PII from a prompt using regex patterns.
 * This is a local-only function that does not require an API key.
 * 
 * @param prompt - The text to scan for PII
 * @returns Object containing original prompt, redacted prompt, and detection array
 */
export function detectPII(prompt: string): RedactedResult {
  const rawDetections: { key: string; value: string }[] = [];
  const seen = new Set<string>();

  const collect = (regex: RegExp, key: string) => {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((match = re.exec(prompt)) !== null) {
      const value = match[0];
      if (!seen.has(value)) {
        seen.add(value);
        rawDetections.push({ key, value });
      }
    }
  };

  // Email addresses
  collect(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'EMAIL');

  // Phone numbers (simple, international friendly)
  collect(/\b\+?\d[\d\s().-]{6,}\d\b/g, 'PHONE');

  // Credit card numbers (basic 13-16 digits, spaced or dashed)
  collect(/\b(?:\d[ -]*?){13,16}\b/g, 'CARD');

  // SSN-like patterns
  collect(/\b\d{3}-\d{2}-\d{4}\b/g, 'SSN');

  // "My name is X" -> extract the name part
  const nameRe = /\bmy name is\s+([A-Z][a-zA-Z''-]{1,40}(?:\s[A-Z][a-zA-Z''-]{1,40})?)/gi;
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = nameRe.exec(prompt)) !== null) {
    const name = nameMatch[1];
    if (!seen.has(name)) {
      seen.add(name);
      rawDetections.push({ key: 'NAME', value: name });
    }
  }

  // Assign indexed placeholders
  const detection = assignIndexedPlaceholders(rawDetections);

  // Apply replacements
  const redacted = applyDetections(prompt, detection);

  return {
    prompt,
    redacted_prompt: redacted,
    detection,
  };
}

/**
 * Assigns unique indexed placeholders per category.
 * E.g., two NAMEs become [NAME_1] and [NAME_2].
 */
function assignIndexedPlaceholders(
  rawDetections: Array<{ key: string; value: string }>
): PIIDetection[] {
  const counters: Record<string, number> = {};
  const seen = new Set<string>(); // avoid duplicates

  return rawDetections
    .filter((d) => {
      // Filter out trivially short or numeric-only values
      const val = (d.value ?? '').trim();
      if (!val || val.length < 2) return false;
      if (/^\d{1,5}$/.test(val)) return false; // skip small numbers like "4", "16722"
      return true;
    })
    .map((d) => {
      const key = (d.key ?? 'PII').toUpperCase();
      const value = d.value ?? '';

      // Create a unique key for deduplication
      const uniqueKey = `${key}:${value.toLowerCase()}`;
      if (seen.has(uniqueKey)) {
        // Skip if we've already seen this exact key-value pair
        return null;
      }
      seen.add(uniqueKey);

      // Increment counter for this category
      counters[key] = (counters[key] || 0) + 1;
      const index = counters[key];

      // Create placeholder like [NAME_1], [EMAIL_2]
      const placeholder = `[${key}_${index}]`;

      return {
        key,
        value,
        placeholder,
        index,
      };
    })
    .filter((d): d is PIIDetection => d !== null);
}

/**
 * Applies PII detections to the prompt, replacing values with placeholders.
 * Sorts by length (longest first) to avoid partial overlaps.
 */
function applyDetections(prompt: string, detection: PIIDetection[]): string {
  // Sort by value length (longest first) to avoid partial replacements
  const sorted = [...detection].sort((a, b) => b.value.length - a.value.length);

  let result = prompt;
  for (const d of sorted) {
    // Escape special regex characters in the value
    const escaped = escapeRegExp(d.value);
    // Use global replace to handle multiple occurrences
    const regex = new RegExp(escaped, 'g');
    result = result.replace(regex, d.placeholder);
  }

  return result;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

