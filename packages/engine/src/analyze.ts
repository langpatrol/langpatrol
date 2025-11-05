/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import type { AnalyzeInput, Report } from './types';
import { run as runPlaceholders } from './rules/placeholders';
import { run as runReference } from './rules/reference';
import { run as runConflicts } from './rules/conflicts';
import { run as runSchemaRisk } from './rules/schemaRisk';
import { run as runTokens } from './rules/tokens';

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
  report.meta = {
    ...report.meta,
    latencyMs: totalTime,
    ruleTimings
  };

  return report;
}

