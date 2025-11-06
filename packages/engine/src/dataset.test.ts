import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from './analyze';
import type { AnalyzeInput } from './types';

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return headers.reduce((acc, header, i) => {
      acc[header] = values[i] || '';
      return acc;
    }, {} as Record<string, string>);
  });
}

describe('synthetic dataset validation', () => {
  it('should pass dataset validation', () => {
    const csvPath = join(__dirname, '../../../datasets/synthetic/langpatrol_synthetic_validation_dataset.csv');
    
    // Skip test if dataset file doesn't exist
    if (!existsSync(csvPath)) {
      console.log('Dataset file not found, skipping validation test');
      return;
    }
    
    const csv = readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(csv);

    for (const row of rows) {
      let messages: any;
      try {
        messages = row.messages_json ? JSON.parse(row.messages_json) : undefined;
      } catch {
        messages = undefined;
      }

      let schema: any;
      try {
        schema = row.schema_json ? JSON.parse(row.schema_json) : undefined;
      } catch {
        schema = undefined;
      }

      const input: AnalyzeInput = {
        prompt: row.prompt || undefined,
        messages,
        schema,
        model: 'gpt-4o'
      };

      const report = analyze(input);
      const got = new Set(report.issues.map((i) => i.code));

      let want: string[] = [];
      try {
        want = JSON.parse(row.expected_issue_codes);
      } catch {
        want = [];
      }

      for (const code of want) {
        expect(got.has(code)).toBe(true);
      }
    }
  });
});

