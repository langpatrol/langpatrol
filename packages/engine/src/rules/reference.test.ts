/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

import { describe, it, expect } from 'vitest';
import { run } from './reference';
import type { AnalyzeInput, Report } from '../types';

describe('MISSING_REFERENCE rule', () => {
  const createReport = (): Report => ({
    issues: [],
    suggestions: [],
    cost: { estInputTokens: 0 }
  });

  describe('Phase 2: Taxonomy and synonym matching', () => {
    it('should detect missing reference with taxonomy nouns', () => {
      const input: AnalyzeInput = {
        prompt: 'Summarize the paper.'
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].code).toBe('MISSING_REFERENCE');
    });

    it('should resolve reference via synonym (paper -> document)', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'I have a document about climate change.' },
          { role: 'assistant', content: 'Got it.' },
          { role: 'user', content: 'Summarize the paper.' }
        ]
      };
      const report = createReport();
      run(input, report);
      // Should NOT flag because "paper" is synonym of "document" which was mentioned
      expect(report.issues.length).toBe(0);
    });

    it('should resolve reference via synonym (report -> document)', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'I have a document about sales.' },
          { role: 'assistant', content: 'Got it.' },
          { role: 'user', content: 'Summarize the report.' }
        ]
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBe(0);
    });

    it('should detect missing reference when synonym not found', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'Hello world.' },
          { role: 'assistant', content: 'Hi there.' },
          { role: 'user', content: 'Summarize the report.' }
        ]
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].code).toBe('MISSING_REFERENCE');
    });
  });

  describe('Phase 2: Normalization', () => {
    it('should handle plural forms in references', () => {
      const input: AnalyzeInput = {
        prompt: 'Summarize the reports.'
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].code).toBe('MISSING_REFERENCE');
    });

    it('should resolve plural reference when singular was mentioned', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'I have a report about sales.' },
          { role: 'assistant', content: 'Got it.' },
          { role: 'user', content: 'Summarize the reports.' }
        ]
      };
      const report = createReport();
      run(input, report);
      // Should resolve because "report" (singular) matches "reports" (plural) after normalization
      expect(report.issues.length).toBe(0);
    });
  });

  describe('Phase 2: Windowed search', () => {
    it('should respect message window limit', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'I have a report about sales.' },
          { role: 'assistant', content: 'Got it.' },
          { role: 'user', content: 'Another message.' },
          { role: 'assistant', content: 'OK.' },
          { role: 'user', content: 'Summarize the report.' }
        ],
        options: {
          antecedentWindow: { messages: 1 } // Only search last 1 message (should not find "report")
        }
      };
      const report = createReport();
      run(input, report);
      // Should flag because window is too small to find the earlier mention
      expect(report.issues.length).toBeGreaterThan(0);
    });

    it('should find reference within message window', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'I have a report about sales.' },
          { role: 'assistant', content: 'Got it.' },
          { role: 'user', content: 'Summarize the report.' }
        ],
        options: {
          antecedentWindow: { messages: 2 } // Search last 2 messages (should find "report")
        }
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBe(0);
    });
  });

  describe('Phase 2: Confidence levels', () => {
    it('should set low confidence for short history', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'Hi.' },
          { role: 'user', content: 'Summarize the report.' }
        ]
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].confidence).toBe('low');
    });

    it('should set high confidence for long history with unresolved references', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'This is a long message with many words to ensure we have enough history to trigger high confidence. It contains various topics and discussions.' },
          { role: 'assistant', content: 'I understand.' },
          { role: 'user', content: 'Summarize the report.' }
        ]
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].confidence).toBe('high');
    });
  });

  describe('Phase 2: User-provided extensions', () => {
    it('should use custom reference heads', () => {
      const input: AnalyzeInput = {
        prompt: 'Summarize the customnoun.',
        options: {
          referenceHeads: ['customnoun']
        }
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].code).toBe('MISSING_REFERENCE');
    });

    it('should use custom synonyms', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'I have a customdoc about sales.' },
          { role: 'assistant', content: 'Got it.' },
          { role: 'user', content: 'Summarize the customreport.' }
        ],
        options: {
          referenceHeads: ['customdoc', 'customreport'],
          synonyms: {
            customreport: ['customdoc']
          }
        }
      };
      const report = createReport();
      run(input, report);
      // Should resolve via custom synonym
      expect(report.issues.length).toBe(0);
    });
  });

  describe('Basic functionality', () => {
    it('should detect missing reference in prompt-only input', () => {
      const input: AnalyzeInput = {
        prompt: 'Summarize the report.'
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].code).toBe('MISSING_REFERENCE');
    });

    it('should not flag when reference exists in history', () => {
      const input: AnalyzeInput = {
        messages: [
          { role: 'user', content: 'I have a report about sales.' },
          { role: 'assistant', content: 'Got it.' },
          { role: 'user', content: 'Summarize the report.' }
        ]
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBe(0);
    });

    it('should detect deictic cues without candidates', () => {
      const input: AnalyzeInput = {
        prompt: 'Continue as discussed above.'
      };
      const report = createReport();
      run(input, report);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].code).toBe('MISSING_REFERENCE');
    });

    it('should check attachments for antecedents', () => {
      const input: AnalyzeInput = {
        prompt: 'Summarize the report.',
        attachments: [
          { type: 'pdf', name: 'sales_report.pdf' }
        ]
      };
      const report = createReport();
      run(input, report);
      // Should resolve via attachment name
      expect(report.issues.length).toBe(0);
    });
  });
});
