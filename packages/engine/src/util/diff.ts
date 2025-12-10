/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

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

