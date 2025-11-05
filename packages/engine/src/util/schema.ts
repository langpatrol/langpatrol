/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import Ajv from 'ajv';
import type { JSONSchema7 } from '../types';

const ajv = new Ajv();

export function validateSchema(schema: JSONSchema7): boolean {
  try {
    ajv.compile(schema);
    return true;
  } catch {
    return false;
  }
}

export function hasJsonKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('json') ||
    lower.includes('{') ||
    lower.includes('[') ||
    lower.includes('"')
  );
}

export function hasProseAfterJsonPattern(text: string): boolean {
  const patterns = [
    /add\s+(?:notes|commentary|explanation|discussion)\s+(?:after|following|below)/i,
    /include\s+(?:notes|commentary|explanation|discussion)\s+(?:after|following|below)/i,
    /output\s+json\s+(?:and|then|followed\s+by)/i,
    /json\s+(?:and|then|followed\s+by)\s+(?:notes|commentary|explanation)/i
  ];
  return patterns.some((p) => p.test(text));
}

