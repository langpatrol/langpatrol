import { describe, it, expect } from 'vitest';
import { run } from './reference';
import type { AnalyzeInput, Report } from '../types';

describe('reference rule', () => {
  it('should detect missing reference', () => {
    const input: AnalyzeInput = {
      messages: [{ role: 'user', content: 'Summarize the report.' }]
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0].code).toBe('MISSING_REFERENCE');
  });

  it('should not flag when reference exists in history', () => {
    const input: AnalyzeInput = {
      messages: [
        { role: 'user', content: 'Here is the sales report: Q3 revenue was $1M' },
        { role: 'user', content: 'Summarize the report.' }
      ]
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.filter((i) => i.code === 'MISSING_REFERENCE')).toHaveLength(0);
  });

  it('should detect deictic cues without context', () => {
    const input: AnalyzeInput = {
      messages: [{ role: 'user', content: 'Continue the list.' }]
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.some((i) => i.code === 'MISSING_REFERENCE')).toBe(true);
  });
});

