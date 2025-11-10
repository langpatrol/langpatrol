/**
 * Copyright (c) 2025 Langpatrol (Gavel Inc.)
 * Licensed under the Elastic License 2.0.
 * See LICENSE file for details.
 */
// SPDX-License-Identifier: Elastic-2.0

// JSONSchema7 type definition (compatible with json-schema draft-07)
export type JSONSchema7 = {
  $id?: string;
  $schema?: string;
  $ref?: string;
  title?: string;
  description?: string;
  default?: any;
  examples?: any[];
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
  enum?: any[];
  type?: string | string[];
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  not?: JSONSchema7;
  if?: JSONSchema7;
  then?: JSONSchema7;
  else?: JSONSchema7;
  format?: string;
  const?: any;
};

export type Role = 'system' | 'user' | 'assistant';

export type Msg = { role: Role; content: string };

export type IssueCode =
  | 'MISSING_PLACEHOLDER'
  | 'MISSING_REFERENCE'
  | 'CONFLICTING_INSTRUCTION'
  | 'SCHEMA_RISK'
  | 'TOKEN_OVERAGE';

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
  fulfillmentMethod?: 'pattern' | 'semantic-similarity' | 'nli-entailment' | 'none';
  fulfillmentConfidence?: number;
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
    antecedentWindow?: {
      messages?: number; // max messages to search back (default: all)
      bytes?: number; // max bytes to search back (default: unlimited)
    };
    disabledRules?: IssueCode[]; // rules to skip
    tokenEstimation?: 'auto' | 'cheap' | 'exact' | 'off'; // token estimation mode
  };
};

