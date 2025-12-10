/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import type { AnalyzeInput, Report } from '../types';
import { validateSchema } from '../util/schema';
import { createIssueId } from '../util/reporting';

export function run(input: AnalyzeInput, acc: Report): void {
  if (!input.schema) return;

  const validation = validateSchema(input.schema);

  if (validation.valid) return;

  const issueId = createIssueId();
  const errors = validation.errors || [];
  
  // Group errors by type for summary
  const errorSummary = errors.reduce((acc, err) => {
    const key = err.keyword || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const summary = Object.entries(errorSummary).map(([text, count]) => ({
    text,
    count
  }));

  // Create occurrences from errors (limit to first 10 for performance)
  const occurrences = errors.slice(0, 10).map(err => ({
    text: err.message || 'Validation error',
    start: 0,
    end: 0,
    preview: err.instancePath 
      ? `Path: ${err.instancePath} - ${err.message}`
      : err.message || 'Schema validation error'
  }));

  // Create a detailed error message
  const errorMessages = errors
    .slice(0, 5)
    .map(err => {
      const path = err.instancePath || 'root';
      return `${path}: ${err.message}`;
    })
    .join('; ');

  const detail = errors.length === 1
    ? `Invalid JSON schema: ${errorMessages}`
    : `Invalid JSON schema with ${errors.length} error${errors.length > 1 ? 's' : ''}: ${errorMessages}${errors.length > 5 ? '...' : ''}`;

  acc.issues.push({
    id: issueId,
    code: 'INVALID_SCHEMA',
    severity: 'high',
    detail,
    evidence: {
      summary,
      occurrences
    },
    scope: { type: 'prompt' },
    confidence: 'high'
  });

  acc.suggestions = acc.suggestions || [];
  acc.suggestions.push({
    type: 'TIGHTEN_INSTRUCTION',
    text: 'Fix the JSON schema validation errors. Ensure the schema follows JSON Schema 7 specification.',
    for: issueId
  });
}

