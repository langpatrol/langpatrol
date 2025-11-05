import { describe, it, expect } from 'vitest';
import { run } from './placeholders';
import type { AnalyzeInput, Report } from '../types';

describe('placeholders rule', () => {
  it('should detect unresolved handlebars placeholders', () => {
    const input: AnalyzeInput = {
      prompt: 'Hello {{customer_name}}, welcome!',
      templateDialect: 'handlebars'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('MISSING_PLACEHOLDER');
    expect(report.issues[0].detail).toContain('customer_name');
  });

  it('should not flag resolved placeholders', () => {
    const input: AnalyzeInput = {
      prompt: 'Hello John, welcome!'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues).toHaveLength(0);
  });

  it('should detect multiple placeholders', () => {
    const input: AnalyzeInput = {
      prompt: 'Process {{user_id}} and {{order_id}}',
      templateDialect: 'handlebars'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].detail).toContain('user_id');
    expect(report.issues[0].detail).toContain('order_id');
  });
});

