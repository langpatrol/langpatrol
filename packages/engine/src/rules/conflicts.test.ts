import { describe, it, expect } from 'vitest';
import { run } from './conflicts';
import type { AnalyzeInput, Report } from '../types';

describe('conflicts rule', () => {
  it('should detect verbosity conflict', () => {
    const input: AnalyzeInput = {
      prompt: 'Be concise and give a detailed step by step explanation.'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('CONFLICTING_INSTRUCTION');
    expect(report.issues[0].detail).toContain('concise');
  });

  it('should detect JSON vs explanation conflict', () => {
    const input: AnalyzeInput = {
      prompt: 'Output JSON only. Add commentary after the JSON.'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('CONFLICTING_INSTRUCTION');
  });

  it('should not flag non-conflicting instructions', () => {
    const input: AnalyzeInput = {
      prompt: 'Be concise and brief.'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.filter((i) => i.code === 'CONFLICTING_INSTRUCTION')).toHaveLength(0);
  });
});

