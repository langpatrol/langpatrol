/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import { diffLines } from 'diff';
import type { Patch } from '../types';

export function generatePatch(original: string, proposed: string): Patch {
  const patches = diffLines(original, proposed);
  const diff = patches
    .map((part) => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      return part.value
        .split('\n')
        .filter(Boolean)
        .map((line) => `${prefix} ${line}`)
        .join('\n');
    })
    .join('\n');

  return {
    original,
    proposed,
    diff
  };
}

