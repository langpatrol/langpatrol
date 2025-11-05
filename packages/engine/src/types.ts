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

export type Issue = {
  code: IssueCode;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  evidence?: string[];
};

export type Suggestion =
  | { type: 'ADD_CONTEXT'; text: string }
  | { type: 'TIGHTEN_INSTRUCTION'; text: string }
  | { type: 'ENFORCE_JSON'; text: string }
  | { type: 'TRIM_CONTEXT'; text: string };

export type Patch = { original: string; proposed: string; diff: string };

export type Report = {
  issues: Issue[];
  suggestions: Suggestion[];
  patch?: Patch;
  cost?: { estInputTokens: number; estUSD?: number };
  meta?: {
    latencyMs: number;
    modelHint?: string;
    ruleTimings?: Record<string, number>;
  };
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
    referenceHeads?: string[]; // extend default lexicon
    disabledRules?: IssueCode[]; // rules to skip
    tokenEstimation?: 'auto' | 'cheap' | 'exact' | 'off'; // token estimation mode
  };
};

