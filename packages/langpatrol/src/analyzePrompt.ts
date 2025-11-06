/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import { analyze, type AnalyzeInput, type Report } from '@langpatrol/engine';

export async function analyzePrompt(input: AnalyzeInput): Promise<Report> {
  const report = analyze(input);
  // Ensure meta exists with required fields
  if (!report.meta) {
    report.meta = {
      latencyMs: 0
    };
  }
  // Ensure modelHint is set if not already present
  if (input.model && !report.meta.modelHint) {
    report.meta.modelHint = input.model;
  }
  return report;
}

