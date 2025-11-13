/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import { FORWARD_REF_PATTERNS } from '@langpatrol/rules';

export type ForwardRefMatch = {
  text: string;
  start: number;
  end: number;
  pattern: string;
  extractedNoun?: string; // For patterns that extract a noun (e.g., "the following report")
};

/**
 * Detects forward-reference expressions like "the following ...", "as shown below", "these files/data/items"
 * Returns all matches found in the text, handling nested patterns correctly.
 */
export function detectForwardReferences(text: string): ForwardRefMatch[] {
  const matches: ForwardRefMatch[] = [];
  const seenRanges = new Set<string>(); // Track ranges to avoid duplicates

  for (const pattern of FORWARD_REF_PATTERNS) {
    // Reset regex lastIndex to avoid state issues
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const rangeKey = `${start}-${end}`;

      // Skip if we've already seen this exact range (handles overlapping patterns)
      if (seenRanges.has(rangeKey)) {
        continue;
      }
      seenRanges.add(rangeKey);

      // Extract noun if pattern captured one (e.g., "the following report" -> "report")
      const extractedNoun = match.length > 1 && match[1] ? match[1].toLowerCase() : undefined;

      matches.push({
        text: match[0],
        start,
        end,
        pattern: pattern.source,
        extractedNoun
      });
    }
  }

  // Sort by start position
  matches.sort((a, b) => a.start - b.start);

  return matches;
}

