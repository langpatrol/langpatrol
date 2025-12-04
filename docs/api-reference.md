# API Reference

## Overview

This document provides complete API reference for LangPatrol. For usage examples and guides, see [Quick Start Guide](./QUICKSTART.md).

## Main Entry Point

### `analyzePrompt(input: AnalyzeInput): Promise<Report>`

Analyzes a prompt or conversation and returns a report with detected issues.

**Location:** `packages/langpatrol/src/analyzePrompt.ts`

**Parameters:**

```typescript
type AnalyzeInput = {
  prompt?: string;              // Single prompt string
  messages?: Msg[];             // Conversation history
  schema?: JSONSchema7;         // JSON schema (optional)
  model?: string;               // Model name (for token limits)
  templateDialect?: string;     // Template dialect hint
  attachments?: Attachment[];   // File attachments (future)
  options?: AnalyzeOptions;     // Configuration options
}
```

**Returns:** `Promise<Report>`

**Example:**

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Summarize the report.',
  model: 'gpt-4o'
});
```

## Types

### `AnalyzeInput`

Input to the analysis function.

```typescript
type AnalyzeInput = {
  prompt?: string;
  messages?: Msg[];
  schema?: JSONSchema7;
  model?: string;
  templateDialect?: 'handlebars' | 'jinja' | 'mustache' | 'ejs';
  attachments?: Attachment[];
  options?: AnalyzeOptions;
}
```

### `Report`

Output from the analysis function.

```typescript
type Report = {
  issues: Issue[];
  suggestions?: Suggestion[];
  patch?: Patch;
  cost?: ReportCost;
  meta?: ReportMeta;
  summary?: ReportSummary;
}
```

### `Issue`

A detected issue in the prompt.

```typescript
type Issue = {
  id?: string;
  code: IssueCode;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  evidence?: string[] | IssueEvidence;
  scope?: IssueScope;
  confidence?: 'low' | 'medium' | 'high';
}
```

### `IssueCode`

Types of issues that can be detected.

```typescript
type IssueCode =
  | 'MISSING_PLACEHOLDER'
  | 'MISSING_REFERENCE'
  | 'CONFLICTING_INSTRUCTION'
  | 'SCHEMA_RISK'
  | 'TOKEN_OVERAGE'
  | 'OUT_OF_CONTEXT'; // Cloud-only: Detected when prompt doesn't match domain activity
```

### `Suggestion`

Actionable suggestion to fix an issue.

```typescript
type Suggestion =
  | { type: 'ADD_CONTEXT'; text: string; for?: string }
  | { type: 'TIGHTEN_INSTRUCTION'; text: string; for?: string }
  | { type: 'ENFORCE_JSON'; text: string; for?: string }
  | { type: 'TRIM_CONTEXT'; text: string; for?: string };
```

### `ReportCost`

Token and cost estimates.

```typescript
type ReportCost = {
  estInputTokens: number;
  estUSD?: number;
  charCount?: number;
  method?: string;
}
```

### `ReportMeta`

Metadata about the analysis.

```typescript
type ReportMeta = {
  latencyMs: number;
  modelHint?: string;
  ruleTimings?: Record<string, number>;
  contextWindow?: number;
  traceId?: string;
}
```

## Configuration Options

### `AnalyzeOptions`

All available configuration options.

```typescript
type AnalyzeOptions = {
  // Rule control
  disabledRules?: IssueCode[];
  
  // Token limits
  maxCostUSD?: number;
  maxInputTokens?: number;
  maxChars?: number;
  
  // Token estimation
  tokenEstimation?: 'auto' | 'cheap' | 'exact' | 'off';
  
  // Reference detection
  referenceHeads?: string[];
  synonyms?: Record<string, string[]>;
  
  // Semantic features
  similarityThreshold?: number;
  useSemanticSimilarity?: boolean;
  useNLIEntailment?: boolean;
  usePatternMatching?: boolean;
  
  // Fulfillment checking
  useCombinedScoring?: boolean;
  combineWeights?: {
    pattern?: number;
    semantic?: number;
    nli?: number;
  };
  combinedThreshold?: number;
  
  // Context-aware matching
  useChunkedMatching?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  useSentenceLevel?: boolean;
  usePhraseLevel?: boolean;
  useMultiHypothesis?: boolean;
  
  // NLP extraction
  useNLPExtraction?: boolean;
  
  // Antecedent window
  antecedentWindow?: {
    messages?: number;
    bytes?: number;
  };
  
  // Cloud API options
  apiKey?: string; // API key for cloud API - if provided, analysis will be performed via cloud API
  apiBaseUrl?: string; // Base URL for cloud API (default: 'http://localhost:3000')
  
  // Domain context checking (cloud-only, requires apiKey and AI Analytics subscription)
  check_context?: {
    domains: string[]; // List of domain keywords/topics to validate the prompt against
  };
}
```

## Options Reference

### Rule Control

#### `disabledRules?: IssueCode[]`

Disable specific detection rules.

**Example:**
```typescript
{
  options: {
    disabledRules: ['MISSING_PLACEHOLDER', 'TOKEN_OVERAGE']
  }
}
```

### Token Limits

#### `maxCostUSD?: number`

Maximum cost in USD. If estimated cost exceeds this, reports `TOKEN_OVERAGE`.

**Default:** No limit

**Example:**
```typescript
{
  options: {
    maxCostUSD: 0.10
  }
}
```

#### `maxInputTokens?: number`

Maximum input tokens. If estimated tokens exceed this, reports `TOKEN_OVERAGE`.

**Default:** Model context window

**Example:**
```typescript
{
  options: {
    maxInputTokens: 100_000
  }
}
```

#### `maxChars?: number`

Early bail character limit. For inputs exceeding this, skips exact tokenization.

**Default:** `120_000`

**Example:**
```typescript
{
  options: {
    maxChars: 200_000
  }
}
```

### Token Estimation

#### `tokenEstimation?: 'auto' | 'cheap' | 'exact' | 'off'`

Token estimation mode.

- **`auto`** (default) - Smart selection based on context
- **`cheap`** - Fast character-based estimation
- **`exact`** - Accurate tokenization with tiktoken
- **`off`** - Disable token estimation

**Example:**
```typescript
{
  options: {
    tokenEstimation: 'exact'
  }
}
```

### Reference Detection

#### `referenceHeads?: string[]`

Extend the default noun taxonomy for reference detection.

**Example:**
```typescript
{
  options: {
    referenceHeads: ['sku', 'inventory-item', 'product-code']
  }
}
```

#### `synonyms?: Record<string, string[]>`

Custom synonym map for reference detection.

**Example:**
```typescript
{
  options: {
    synonyms: {
      'report': ['document', 'paper', 'memo'],
      'file': ['document', 'attachment']
    }
  }
}
```

### Semantic Features

#### `similarityThreshold?: number`

Threshold for semantic similarity matching (0-1).

**Default:** `0.6`

**Example:**
```typescript
{
  options: {
    similarityThreshold: 0.7
  }
}
```

#### `useSemanticSimilarity?: boolean`

Enable semantic similarity checking.

**Default:** `false` (enabled if `similarityThreshold` is set)

**Example:**
```typescript
{
  options: {
    useSemanticSimilarity: true,
    similarityThreshold: 0.6
  }
}
```

#### `useNLIEntailment?: boolean`

Enable NLI entailment checking.

**Default:** `false` (enabled if `similarityThreshold` is set)

**Example:**
```typescript
{
  options: {
    useNLIEntailment: true
  }
}
```

#### `usePatternMatching?: boolean`

Enable pattern matching for fulfillment checks.

**Default:** `true`

**Example:**
```typescript
{
  options: {
    usePatternMatching: true
  }
}
```

### Fulfillment Checking

#### `useCombinedScoring?: boolean`

Use combined scoring instead of hierarchical fulfillment checking.

**Default:** `false`

**Example:**
```typescript
{
  options: {
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.4,
      semantic: 0.3,
      nli: 0.3
    }
  }
}
```

#### `combineWeights?: { pattern?: number; semantic?: number; nli?: number }`

Weights for combined scoring.

**Defaults:**
- `pattern`: `0.4`
- `semantic`: `0.3`
- `nli`: `0.3`

**Example:**
```typescript
{
  options: {
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.5,
      semantic: 0.3,
      nli: 0.2
    }
  }
}
```

#### `combinedThreshold?: number`

Threshold for combined score to be considered fulfilled.

**Default:** `0.5`

**Example:**
```typescript
{
  options: {
    useCombinedScoring: true,
    combinedThreshold: 0.6
  }
}
```

### Context-Aware Matching

#### `useChunkedMatching?: boolean`

Use chunked matching for long contexts.

**Default:** `false` (auto-enabled for texts > 1000 chars)

**Example:**
```typescript
{
  options: {
    useChunkedMatching: true,
    chunkSize: 500,
    chunkOverlap: 100
  }
}
```

#### `chunkSize?: number`

Size of each chunk for chunked matching.

**Default:** `500`

**Example:**
```typescript
{
  options: {
    useChunkedMatching: true,
    chunkSize: 1000
  }
}
```

#### `chunkOverlap?: number`

Overlap between chunks.

**Default:** `100`

**Example:**
```typescript
{
  options: {
    useChunkedMatching: true,
    chunkOverlap: 200
  }
}
```

#### `useSentenceLevel?: boolean`

Use sentence-level matching.

**Default:** `false`

**Example:**
```typescript
{
  options: {
    useSentenceLevel: true
  }
}
```

#### `usePhraseLevel?: boolean`

Use phrase-level matching.

**Default:** `false`

**Example:**
```typescript
{
  options: {
    usePhraseLevel: true
  }
}
```

#### `useMultiHypothesis?: boolean`

Use multiple NLI hypotheses.

**Default:** `true`

**Example:**
```typescript
{
  options: {
    useMultiHypothesis: true
  }
}
```

### NLP Extraction

#### `useNLPExtraction?: boolean`

Use NER model for noun extraction instead of taxonomy.

**Default:** `false`

**Example:**
```typescript
{
  options: {
    useNLPExtraction: true
  }
}
```

### Antecedent Window

#### `antecedentWindow?: { messages?: number; bytes?: number }`

Limit search window for reference detection.

**Example:**
```typescript
{
  options: {
    antecedentWindow: {
      messages: 10,    // Max messages to search back
      bytes: 50000    // Max bytes to search back
    }
  }
}
```

### Cloud API Options

#### `apiKey?: string`

API key for LangPatrol Cloud API. When provided, analysis is performed via the cloud API instead of local processing.

**Note:** Requires a LangPatrol Cloud account and API key.

**Example:**
```typescript
{
  options: {
    apiKey: 'lp_your_api_key_here',
    apiBaseUrl: 'https://api.langpatrol.com'
  }
}
```

#### `apiBaseUrl?: string`

Base URL for the cloud API. Defaults to `http://localhost:3000` if not provided.

**Example:**
```typescript
{
  options: {
    apiKey: 'lp_your_api_key_here',
    apiBaseUrl: 'https://api.langpatrol.com'
  }
}
```

### Domain Context Checking

#### `check_context?: { domains: string[] }`

**Cloud-only feature** - Validates that the prompt is relevant to your specified domain of activity. Requires an API key and AI Analytics subscription.

When enabled, LangPatrol uses AI to check if the prompt matches your domain keywords. If the prompt is unrelated, it returns an `OUT_OF_CONTEXT` error with high severity.

**Requirements:**
- Must provide `apiKey` in options
- Requires AI Analytics subscription (Pro tier or higher)
- Automatically routes to `/api/v1/ai-analytics` endpoint

**Example:**
```typescript
{
  prompt: 'How do I cook pasta?',
  options: {
    apiKey: 'lp_your_api_key_here',
    apiBaseUrl: 'https://api.langpatrol.com',
    check_context: {
      domains: ['salesforce', 'CRM', 'business automation']
    }
  }
}
// This will return OUT_OF_CONTEXT error since cooking is not related to Salesforce/CRM
```

**Error Code:** `OUT_OF_CONTEXT` (high severity)

## Adapters

LangPatrol provides adapters for popular frameworks.

### LangChain Adapter

**Location:** `packages/langpatrol/src/adapters/langchain.ts`

**Example:**
```typescript
import { guardedCall } from 'langpatrol/adapters/langchain';

const result = await guardedCall(messages, model);
```

### Vercel AI SDK Adapter

**Location:** `packages/langpatrol/src/adapters/vercel-ai-sdk.ts`

**Example:**
```typescript
import { guardedCall } from 'langpatrol/adapters/vercel-ai-sdk';

const result = await guardedCall(messages, model);
```

## Engine API

The core engine is also available directly (though the public SDK is recommended).

### `analyze(input: AnalyzeInput): Report`

Synchronous analysis function (no semantic features).

**Location:** `packages/engine/src/analyze.ts`

**Example:**
```typescript
import { analyze } from '@langpatrol/engine';

const report = analyze({
  prompt: 'Summarize the report.',
  model: 'gpt-4o'
});
```

### `runReferenceAsync(input: AnalyzeInput, report: Report): Promise<void>`

Async reference detection with semantic features.

**Location:** `packages/engine/src/rules/reference.ts`

**Example:**
```typescript
import { runReferenceAsync } from '@langpatrol/engine';

const report = analyze(input);
await runReferenceAsync(input, report);
```

## Utility Functions

### Tokenization

```typescript
import {
  estimateTokensAuto,
  exactTokens,
  getModelWindow,
  getModelPricing,
  estimateCost
} from '@langpatrol/engine';
```

### Semantic Similarity

```typescript
import {
  computeSemanticSimilarity,
  isSemanticSimilarityAvailable
} from '@langpatrol/engine';
```

### NLI Entailment

```typescript
import {
  checkEntailment,
  isNLIEntailmentAvailable
} from '@langpatrol/engine';
```

## Error Handling

LangPatrol functions don't throw errors. Instead, they return reports with issues:

```typescript
const report = await analyzePrompt({ prompt, model });

if (report.issues.length > 0) {
  // Handle issues
  report.issues.forEach(issue => {
    console.error(`${issue.code}: ${issue.detail}`);
  });
}
```

## Next Steps

- [Quick Start Guide](./QUICKSTART.md) - Get started in 5 minutes
- [Configuration Options](#configuration-options) - Fine-tune detection
- [Detection Rules](./rules/missing-placeholder.md) - Learn about each rule

