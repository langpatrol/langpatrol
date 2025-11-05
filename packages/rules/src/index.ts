/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

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

export const DEICTIC_CUES = /\b(as (?:discussed|mentioned|above)|continue|same as before|previous(?:ly)?|the previous)\b/i;

export const DEF_NP = /\b(the|this|that|these|those|aforementioned)\s+([a-z][a-z0-9_-]{2,})\b/gi;

export const VERBOSE_PATTERNS = /\b(detailed|comprehensive|step by step|exhaustive)\b/i;

export const CONCISE_PATTERNS = /\b(concise|brief|minimal|short)\b/i;

export const JSON_ONLY_PATTERNS = /\b(json\s*only|strict\s*json|return\s*valid\s*json|output\s*must\s*be\s*json)\b/i;

export const EXPLANATORY_PATTERNS = /\b(explain|commentary|notes|discussion)\b/i;

