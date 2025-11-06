/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

// Legacy flat lexicon (kept for backwards compatibility)
export const NP_LEXICON = new Set([
  'report',
  'document',
  'list',
  'summary',
  'table',
  'dataset',
  'code',
  'snippet',
  'transcript',
  'email',
  'ticket',
  'invoice',
  'order',
  'spec',
  'prd',
  'message',
  'conversation',
  'results',
  'output',
  'context'
]);

// Phase 2: Taxonomy-based head nouns grouped by semantic class
export const NOUN_TAXONOMY = {
  artifact: ['report', 'document', 'paper', 'spec', 'transcript', 'email', 'pdf', 'memo', 'file'],
  structure: ['list', 'table', 'dataset', 'grid', 'csv', 'results', 'output', 'summary'],
  communication: ['conversation', 'thread', 'chat', 'message', 'ticket', 'discussion'],
  code: ['snippet', 'script', 'function', 'file', 'notebook', 'code']
} as const;

// Phase 2: Synonym maps per class (head noun -> synonyms)
export const SYNONYMS: Record<string, string[]> = {
  // Artifact class
  report: ['paper', 'document', 'memo', 'file'],
  document: ['report', 'paper', 'memo', 'file'],
  paper: ['report', 'document', 'memo'],
  memo: ['report', 'document', 'paper'],
  
  // Structure class
  list: ['items', 'bullets', 'entries'],
  table: ['grid', 'dataset', 'spreadsheet'],
  dataset: ['table', 'data', 'csv'],
  results: ['output', 'findings', 'outcomes'],
  output: ['results', 'findings'],
  
  // Communication class
  conversation: ['thread', 'chat', 'discussion'],
  thread: ['conversation', 'chat'],
  chat: ['conversation', 'thread'],
  message: ['note', 'communication'],
  
  // Code class
  snippet: ['code', 'script', 'function'],
  code: ['snippet', 'script', 'function'],
  script: ['code', 'snippet', 'function']
};

// Helper: Get all nouns in a taxonomy class
export function getNounsInClass(className: keyof typeof NOUN_TAXONOMY): string[] {
  return [...NOUN_TAXONOMY[className]];
}

// Helper: Get all nouns across all classes (for backwards compatibility)
export function getAllTaxonomyNouns(): Set<string> {
  const all = new Set<string>();
  Object.values(NOUN_TAXONOMY).forEach(nouns => {
    nouns.forEach(noun => all.add(noun));
  });
  return all;
}

// Helper: Get synonyms for a head noun (including the noun itself)
export function getSynonyms(headNoun: string): Set<string> {
  const synonyms = new Set<string>([headNoun.toLowerCase()]);
  const synList = SYNONYMS[headNoun.toLowerCase()];
  if (synList) {
    synList.forEach(syn => synonyms.add(syn.toLowerCase()));
  }
  return synonyms;
}

export const DEICTIC_CUES = /\b(as (?:discussed|mentioned|above)|continue|same as before|previous(?:ly)?|the previous)\b/i;

export const DEF_NP = /\b(the|this|that|these|those|aforementioned)\s+([a-z][a-z0-9_-]{2,})\b/gi;

export const VERBOSE_PATTERNS = /\b(detailed|comprehensive|step by step|exhaustive)\b/i;

export const CONCISE_PATTERNS = /\b(concise|brief|minimal|short)\b/i;

export const JSON_ONLY_PATTERNS = /\b(json\s*only|strict\s*json|return\s*valid\s*json|output\s*must\s*be\s*json)\b/i;

export const EXPLANATORY_PATTERNS = /\b(explain|commentary|notes|discussion)\b/i;

