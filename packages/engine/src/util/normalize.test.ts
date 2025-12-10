/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { normalizeNoun, normalizePhrase } from './normalize';

describe('normalize', () => {
  describe('normalizeNoun', () => {
    it('should lowercase and strip punctuation', () => {
      expect(normalizeNoun('Report')).toBe('report');
      expect(normalizeNoun('REPORT!')).toBe('report');
      expect(normalizeNoun('report.')).toBe('report');
      expect(normalizeNoun('report,')).toBe('report');
    });

    it('should singularize common plurals', () => {
      expect(normalizeNoun('reports')).toBe('report');
      expect(normalizeNoun('lists')).toBe('list');
      expect(normalizeNoun('tables')).toBe('table');
      expect(normalizeNoun('datasets')).toBe('dataset');
      expect(normalizeNoun('files')).toBe('file');
    });

    it('should handle words ending in -ies', () => {
      expect(normalizeNoun('stories')).toBe('story');
      expect(normalizeNoun('categories')).toBe('category');
    });

    it('should handle words ending in -es', () => {
      expect(normalizeNoun('boxes')).toBe('box');
      expect(normalizeNoun('classes')).toBe('class');
    });

    it('should handle already singular words', () => {
      expect(normalizeNoun('report')).toBe('report');
      expect(normalizeNoun('list')).toBe('list');
    });
  });

  describe('normalizePhrase', () => {
    it('should lowercase and normalize whitespace', () => {
      expect(normalizePhrase('Hello World')).toBe('hello world');
      expect(normalizePhrase('Hello   World')).toBe('hello world');
      expect(normalizePhrase('Hello\nWorld')).toBe('hello world');
    });

    it('should strip punctuation', () => {
      expect(normalizePhrase('Hello, World!')).toBe('hello world');
      expect(normalizePhrase('Hello.World')).toBe('hello world');
      expect(normalizePhrase('Hello (World)')).toBe('hello world');
    });
  });
});

