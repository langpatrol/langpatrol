/**
 * Copyright (c) 2025 LangPatrol (Gavel Inc.)
 * Licensed under the MIT License.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: MIT

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export type JSONSchema7 = {
  $id?: string;
  $schema?: string;
  $ref?: string;
  title?: string;
  description?: string;
  default?: JSONValue;
  examples?: JSONValue[];
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  additionalItems?: boolean | JSONSchema7;
  items?: JSONSchema7 | JSONSchema7[];
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;
  properties?: { [key: string]: JSONSchema7 };
  patternProperties?: { [key: string]: JSONSchema7 };
  dependencies?: { [key: string]: JSONSchema7 | string[] };
  enum?: JSONValue[];
  type?: string | string[];
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  not?: JSONSchema7;
  if?: JSONSchema7;
  then?: JSONSchema7;
  else?: JSONSchema7;
  format?: string;
  const?: JSONValue;
};

export type Role = 'system' | 'user' | 'assistant';

export type Msg = { role: Role; content: string };

export type IssueCode =
  | 'MISSING_PLACEHOLDER'
  | 'MISSING_REFERENCE'
  | 'CONFLICTING_INSTRUCTION'
  | 'SCHEMA_RISK'
  | 'INVALID_SCHEMA'
  | 'TOKEN_OVERAGE'
  | 'OUT_OF_CONTEXT';

export type IssueEvidenceSummary = { text: string; count: number };

export type IssueEvidenceOccurrence = {
  text: string;
  start: number;
  end: number;
  preview?: string;
  messageIndex?: number;
  bucket?: string;
  resolution?: 'unresolved' | 'resolved-by-exact' | 'resolved-by-synonym' | 'resolved-by-memory' | 'resolved-by-attachment';
  fulfillmentStatus?: 'fulfilled' | 'unfulfilled' | 'uncertain';
      fulfillmentMethod?: 'pattern' | 'semantic-similarity' | 'nli-entailment' | 'combined' | 'none';
  fulfillmentConfidence?: number;
  fulfillmentDetails?: {
    patternScore?: number;
    similarityScore?: number;
    entailmentScore?: number;
    combinedScore?: number;
    matchedText?: string;
  };
  term?: string;
  turn?: number;
  pairedWith?: {
    text: string;
    start: number;
    end: number;
    preview?: string;
    messageIndex?: number;
  };
};

export type IssueEvidence = {
  summary?: IssueEvidenceSummary[];
  occurrences?: IssueEvidenceOccurrence[];
  firstSeenAt?: {
    messageIndex?: number;
    char?: number;
  };
};

export type IssueScope = { type: 'prompt' | 'messages'; messageIndex?: number };

export type Issue = {
  id?: string;
  code: IssueCode;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  evidence?: string[] | IssueEvidence;
  scope?: IssueScope;
  confidence?: 'low' | 'medium' | 'high';
};

export type Suggestion =
  | { type: 'ADD_CONTEXT'; text: string; for?: string }
  | { type: 'TIGHTEN_INSTRUCTION'; text: string; for?: string }
  | { type: 'ENFORCE_JSON'; text: string; for?: string }
  | { type: 'TRIM_CONTEXT'; text: string; for?: string };

export type Patch = {
  original?: string;
  proposed?: string;
  diff?: string;
  safe?: boolean;
};

export type ReportCost = {
  estInputTokens: number;
  estUSD?: number;
  charCount?: number;
  method?: string;
};

export type ReportSummary = {
  issueCounts: Partial<Record<IssueCode, number>>;
  confidence?: 'low' | 'medium' | 'high';
};

export type ReportMeta = {
  latencyMs: number;
  modelHint?: string;
  ruleTimings?: Record<string, number>;
  contextWindow?: number;
  traceId?: string;
};

export type Report = {
  issues: Issue[];
  suggestions?: Suggestion[];
  patch?: Patch;
  cost?: ReportCost;
  meta?: ReportMeta;
  summary?: ReportSummary;
};

export type Attachment = {
  type: string;
  name?: string;
};

export type AnalyzeInput = {
  prompt?: string;
  messages?: Msg[];
  schema?: JSONSchema7;
  model?: string;
  templateDialect?: 'handlebars' | 'jinja' | 'mustache' | 'ejs';
  attachments?: Attachment[];
  options?: {
    maxCostUSD?: number;
    maxInputTokens?: number;
    maxChars?: number; // fallback guard for early bail (e.g., 120_000)
    referenceHeads?: string[]; // extend default taxonomy
    synonyms?: Record<string, string[]>; // custom synonym map (extends default)
        similarityThreshold?: number; // for embedding matching (default 0.6)
        useSemanticSimilarity?: boolean; // enable semantic similarity checking (default: false, enabled if similarityThreshold is set)
        useNLIEntailment?: boolean; // enable NLI entailment checking (default: false, enabled if similarityThreshold is set)
        usePatternMatching?: boolean; // enable pattern matching for fulfillment checks (default: true)
        useCombinedScoring?: boolean; // use combined scoring instead of hierarchical (default: false)
        combineWeights?: {
          pattern?: number; // weight for pattern matching (default: 0.4)
          semantic?: number; // weight for semantic similarity (default: 0.3)
          nli?: number; // weight for NLI entailment (default: 0.3)
        };
        combinedThreshold?: number; // threshold for combined score to be considered fulfilled (default: 0.5)
        // Context-aware matching options
        useChunkedMatching?: boolean; // use chunked matching for long contexts (auto-enabled for texts > 1000 chars)
        chunkSize?: number; // size of each chunk for chunked matching (default: 500)
        chunkOverlap?: number; // overlap between chunks (default: 100)
        useSentenceLevel?: boolean; // use sentence-level matching (default: false)
        usePhraseLevel?: boolean; // use phrase-level matching (default: false)
        useMultiHypothesis?: boolean; // use multiple NLI hypotheses (default: true)
        // NLP-based noun extraction options
        useNLPExtraction?: boolean; // use NER model for noun extraction instead of taxonomy (default: false)
    antecedentWindow?: {
      messages?: number; // max messages to search back (default: all)
      bytes?: number; // max bytes to search back (default: unlimited)
    };
    disabledRules?: IssueCode[]; // rules to skip
    tokenEstimation?: 'auto' | 'cheap' | 'exact' | 'off'; // token estimation mode
    // Conflict detection options
    useSemanticConflictDetection?: boolean; // enable semantic similarity for conflict detection (default: false)
    useNLIConflictDetection?: boolean; // enable NLI entailment for conflict detection (default: false)
    conflictSimilarityThreshold?: number; // threshold for detecting semantic conflicts (default: 0.3, lower = more conflicts detected)
    conflictContradictionThreshold?: number; // threshold for NLI contradiction detection (default: 0.7)
    // Cloud API options
    apiKey?: string; // API key for cloud API - if provided, analysis will be performed via cloud API
    apiBaseUrl?: string; // Base URL for cloud API (default: 'http://localhost:3000')
  };
};

// Cloud-only prompt optimization (compression) types
export type OptimizeInput = {
  prompt: string;
  model?: string;
  options?: {
    apiKey?: string; // required when calling cloud API
    apiBaseUrl?: string; // optional base URL override (default: 'http://localhost:3000')
  };
};

export type OptimizeResponse = {
  optimized_prompt: string;
  ratio: string;
  origin_tokens: number;
  optimized_tokens: number;
};

