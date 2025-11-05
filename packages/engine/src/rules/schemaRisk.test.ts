import { describe, it, expect } from 'vitest';
import { run } from './schemaRisk';
import type { AnalyzeInput, Report } from '../types';

describe('schemaRisk rule', () => {
  it('should detect prose after JSON pattern', () => {
    const input: AnalyzeInput = {
      prompt: 'Output JSON only. Add commentary after the JSON.',
      schema: { type: 'object', properties: { name: { type: 'string' } } }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.some((i) => i.code === 'SCHEMA_RISK')).toBe(true);
    expect(report.suggestions.some((s) => s.type === 'ENFORCE_JSON')).toBe(true);
  });

  it('should not flag when schema is not provided', () => {
    const input: AnalyzeInput = {
      prompt: 'Output JSON only.'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.filter((i) => i.code === 'SCHEMA_RISK')).toHaveLength(0);
  });
});

