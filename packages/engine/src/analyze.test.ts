import { describe, it, expect } from 'vitest';
import { analyze } from './analyze';
import type { AnalyzeInput } from './types';

describe('analyze', () => {
  it('should return report with issues', () => {
    const input: AnalyzeInput = {
      prompt: 'Summarize the report.',
      model: 'gpt-4o'
    };

    const report = analyze(input);

    expect(report).toHaveProperty('issues');
    expect(report).toHaveProperty('suggestions');
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it('should detect multiple issue types', () => {
    const input: AnalyzeInput = {
      prompt: 'Be concise and give a detailed step by step explanation.',
      model: 'gpt-4o'
    };

    const report = analyze(input);

    expect(report.issues.length).toBeGreaterThan(0);
  });
});

