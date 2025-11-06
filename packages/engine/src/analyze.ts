/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Report, IssueCode } from './types';
import { run as runPlaceholders } from './rules/placeholders';
import { run as runReference } from './rules/reference';
import { run as runConflicts } from './rules/conflicts';
import { run as runSchemaRisk } from './rules/schemaRisk';
import { run as runTokens } from './rules/tokens';
import { createTraceId, createIssueId } from './util/reporting';
import { getModelWindow } from './util/tokenize';

export function analyze(input: AnalyzeInput): Report {
  const report: Report = {
    issues: [],
    suggestions: []
  };

  const disabledRules = new Set(input.options?.disabledRules || []);
  const ruleTimings: Record<string, number> = {};
  const t0 = performance.now();

  // Run rules conditionally based on disabledRules
  let t = performance.now();
  if (!disabledRules.has('MISSING_PLACEHOLDER')) {
    runPlaceholders(input, report);
  }
  ruleTimings.placeholders = performance.now() - t;

  t = performance.now();
  if (!disabledRules.has('MISSING_REFERENCE')) {
    runReference(input, report);
  }
  ruleTimings.reference = performance.now() - t;

  t = performance.now();
  if (!disabledRules.has('CONFLICTING_INSTRUCTION')) {
    runConflicts(input, report);
  }
  ruleTimings.conflicts = performance.now() - t;

  t = performance.now();
  if (!disabledRules.has('SCHEMA_RISK')) {
    runSchemaRisk(input, report);
  }
  ruleTimings.schemaRisk = performance.now() - t;

  t = performance.now();
  if (!disabledRules.has('TOKEN_OVERAGE')) {
    runTokens(input, report);
  }
  ruleTimings.tokens = performance.now() - t;

  const totalTime = performance.now() - t0;
  const traceId = createTraceId();

  const contextWindow = report.meta?.contextWindow;

  report.meta = {
    ...report.meta,
    latencyMs: totalTime,
    ruleTimings,
    traceId,
    contextWindow: contextWindow ?? (input.model ? getModelWindow(input.model) : undefined)
  };

  // Ensure suggestions array exists
  if (!report.suggestions) {
    report.suggestions = [];
  }

  // Assign ids if missing and build summary counts
  const issueCounts: Partial<Record<IssueCode, number>> = {};
  const seenIds = new Set<string>();
  for (const issue of report.issues) {
    if (!issue.id) {
      let generated: string;
      do {
        generated = createIssueId();
      } while (seenIds.has(generated));
      issue.id = generated;
    }
    seenIds.add(issue.id);
    issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
  }

  if (report.issues.length > 0) {
    report.summary = {
      issueCounts,
      confidence: 'high'
    };
  }

  return report;
}

