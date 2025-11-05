import { describe, it, expect } from 'vitest';
import { run } from './tokens';
import type { AnalyzeInput, Report } from '../types';

describe('tokens rule', () => {
  it('should estimate tokens and cost', () => {
    const input: AnalyzeInput = {
      prompt: 'Hello world',
      model: 'gpt-4o'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.cost).toBeDefined();
    expect(report.cost?.estInputTokens).toBeGreaterThan(0);
  });

  it('should flag token overage', () => {
    const longPrompt = 'word '.repeat(10000); // ~7500 tokens
    const input: AnalyzeInput = {
      prompt: longPrompt,
      model: 'gpt-3.5-turbo', // 16k window
      options: { maxInputTokens: 1000 }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.some((i) => i.code === 'TOKEN_OVERAGE')).toBe(true);
  });
});

