/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import type { AnalyzeInput, Report } from '../types';
import { createIssueId, createPreview } from '../util/reporting';
import { extractText } from '../util/text';

const PLACEHOLDER_HANDLEBARS = /\{\{\s*([#/>!&^]?)([a-zA-Z0-9_.]+)\s*\}\}/g;
const PLACEHOLDER_JINJA = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const PLACEHOLDER_EJS = /<%\s*([a-zA-Z0-9_.]+)\s*%>/g;

export function run(input: AnalyzeInput, acc: Report): void {
  // Analyze full conversation (prompt + all messages) to catch placeholders
  // defined anywhere in the conversation history
  const text = extractText(input);
  if (!text) return;

  const dialect = input.templateDialect || detectDialect(text);
  if (!dialect) return;

  // Get regex pattern and create a fresh instance to avoid lastIndex issues
  const regexPattern = getRegexForDialect(dialect);
  const regex = new RegExp(regexPattern.source, regexPattern.flags);
  const unresolvedMap = new Map<string, { count: number; positions: number[] }>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const varName = match[2] || match[1];
    if (!varName) continue;
    const entry = unresolvedMap.get(varName) || { count: 0, positions: [] };
    entry.count += 1;
    entry.positions.push(match.index);
    unresolvedMap.set(varName, entry);
  }

  if (unresolvedMap.size > 0) {
    const issueId = createIssueId();
    const summary = Array.from(unresolvedMap.entries()).map(([key, value]) => ({
      text: key,
      count: value.count
    }));

    const occurrences = Array.from(unresolvedMap.entries())
      .flatMap(([key, value]) =>
        value.positions.slice(0, 3).map((start) => ({
          text: `{{${key}}}`,
          start,
          end: start + key.length + 4,
          preview: createPreview(text, start, start + key.length + 4)
        }))
      )
      .slice(0, 50);

    acc.issues.push({
      id: issueId,
      code: 'MISSING_PLACEHOLDER',
      severity: 'high',
      detail: `Unresolved placeholder${summary.length > 1 ? 's' : ''}: ${summary
        .map((s) => `${s.text}${s.count > 1 ? ` (×${s.count})` : ''}`)
        .join(', ')}`,
      evidence: {
        summary,
        occurrences,
        firstSeenAt: {
          char: Math.min(...Array.from(unresolvedMap.values()).flatMap((v) => v.positions))
        }
      },
      scope: input.messages && input.messages.length > 0
        ? { type: 'messages', messageIndex: input.messages.length - 1 }
        : { type: 'prompt' },
      confidence: 'high'
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

