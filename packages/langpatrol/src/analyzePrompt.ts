/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import { analyze, type AnalyzeInput, type Report } from '@langpatrol/engine';

export async function analyzePrompt(input: AnalyzeInput): Promise<Report> {
  const t0 = performance.now();
  const report = analyze(input);
  // Preserve rule timings from analyze() and add model hint
  report.meta = {
    ...report.meta,
    latencyMs: report.meta?.latencyMs || performance.now() - t0,
    modelHint: input.model
  };
  return report;
}

