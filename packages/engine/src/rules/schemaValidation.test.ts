import { describe, it, expect } from 'vitest';
import { run } from './schemaValidation';
import type { AnalyzeInput, IssueEvidence, Report } from '../types';

describe('schemaValidation rule', () => {
  it('should detect invalid schema with missing type', () => {
    const input: AnalyzeInput = {
      prompt: 'Return user data',
      schema: {
        properties: {
          name: { type: 'string' }
        }
        // Missing 'type' at root level
      }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.some((i) => i.code === 'INVALID_SCHEMA')).toBe(true);
    expect(report.suggestions?.some((s) => s.type === 'TIGHTEN_INSTRUCTION')).toBe(true);
  });

  it('should detect invalid schema with wrong type value', () => {
    const input: AnalyzeInput = {
      prompt: 'Return user data',
      schema: {
        type: 'invalid_type',
        properties: {
          name: { type: 'string' }
        }
      }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.some((i) => i.code === 'INVALID_SCHEMA')).toBe(true);
  });

  it('should detect invalid schema with invalid property type', () => {
    const input: AnalyzeInput = {
      prompt: 'Return user data',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'invalid' }
        }
      }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.some((i) => i.code === 'INVALID_SCHEMA')).toBe(true);
  });

  it('should not flag when schema is valid', () => {
    const input: AnalyzeInput = {
      prompt: 'Return user data',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.filter((i) => i.code === 'INVALID_SCHEMA')).toHaveLength(0);
  });

  it('should not flag when schema is not provided', () => {
    const input: AnalyzeInput = {
      prompt: 'Return user data'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues.filter((i) => i.code === 'INVALID_SCHEMA')).toHaveLength(0);
  });

  it('should provide detailed error messages', () => {
    const input: AnalyzeInput = {
      prompt: 'Return user data',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'invalid' },
          age: { type: 'number' }
        }
      }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    const issue = report.issues.find((i) => i.code === 'INVALID_SCHEMA');
    expect(issue).toBeDefined();
    expect(issue?.detail).toContain('Invalid JSON schema');
    expect((issue?.evidence as IssueEvidence)?.occurrences?.length).toBeGreaterThan(0);
  });

  it('should handle multiple validation errors', () => {
    const input: AnalyzeInput = {
      prompt: 'Return user data',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'invalid' },
          age: { type: 'also_invalid' }
        }
      }
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    const issue = report.issues.find((i) => i.code === 'INVALID_SCHEMA');
    expect(issue).toBeDefined();
    // Should mention multiple errors
    expect(issue?.detail).toMatch(/\d+\s+error/);
  });
});

