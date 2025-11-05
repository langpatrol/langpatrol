/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Issue, Report } from '../types';

const PLACEHOLDER_HANDLEBARS = /\{\{\s*([#/>!&^]?)([a-zA-Z0-9_.]+)\s*\}\}/g;
const PLACEHOLDER_JINJA = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const PLACEHOLDER_MUSTACHE = /\{\{\s*([#/>!&^]?)([a-zA-Z0-9_.]+)\s*\}\}/g;
const PLACEHOLDER_EJS = /<%\s*([a-zA-Z0-9_.]+)\s*%>/g;

export function run(input: AnalyzeInput, acc: Report): void {
  const text = input.prompt || '';
  if (!text) return;

  const dialect = input.templateDialect || detectDialect(text);
  if (!dialect) return;

  // Get regex pattern and create a fresh instance to avoid lastIndex issues
  const regexPattern = getRegexForDialect(dialect);
  const regex = new RegExp(regexPattern.source, regexPattern.flags);
  const unresolved: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const varName = match[2] || match[1];
    if (varName && !unresolved.includes(varName)) {
      unresolved.push(varName);
    }
  }

  if (unresolved.length > 0) {
    acc.issues.push({
      code: 'MISSING_PLACEHOLDER',
      severity: 'high',
      detail: `Unresolved placeholder${unresolved.length > 1 ? 's' : ''}: ${unresolved.join(', ')}`,
      evidence: unresolved.map((u) => `{{${u}}}`)
    });
  }
}

function detectDialect(text: string): 'handlebars' | 'jinja' | 'mustache' | 'ejs' | null {
  // Test for handlebars/mustache (same pattern)
  if (/\{\{/.test(text)) {
    // Check if it's a simple variable pattern (no special sigils)
    if (/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/.test(text)) {
      return 'handlebars';
    }
  }
  // Test for EJS
  if (/<%/.test(text)) return 'ejs';
  return null;
}

function getRegexForDialect(
  dialect: 'handlebars' | 'jinja' | 'mustache' | 'ejs'
): RegExp {
  switch (dialect) {
    case 'handlebars':
    case 'mustache':
      return PLACEHOLDER_HANDLEBARS;
    case 'jinja':
      return PLACEHOLDER_JINJA;
    case 'ejs':
      return PLACEHOLDER_EJS;
  }
}

