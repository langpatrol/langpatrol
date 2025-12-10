# Architecture Overview

## System Architecture

LangPatrol is built as a modular monorepo with clear separation of concerns. The architecture is designed for:

- **Modularity** - Each package has a single responsibility
- **Performance** - Fast synchronous rules with optional async enhancements
- **Extensibility** - Easy to add new rules or detection methods
- **Developer Experience** - Simple API, rich type definitions

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│  (Your App / CLI / Dev UI / Framework Adapters)        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Public SDK Layer                       │
│              (packages/langpatrol)                       │
│  - analyzePrompt() entry point                           │
│  - Framework adapters (LangChain, Vercel AI SDK)         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Core Engine Layer                       │
│              (@langpatrol/engine)                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Analysis Orchestrator                     │  │
│  │         (analyze.ts)                              │  │
│  └───────┬──────────────────────────────────────────┘  │
│          │                                              │
│          ├─► Rules Engine                              │
│          │   ├─► Placeholder Detection                 │
│          │   ├─► Reference Detection                   │
│          │   ├─► Conflict Detection                   │
│          │   ├─► Schema Risk Detection                │
│          │   └─► Token Overage Detection              │
│          │                                              │
│          └─► Utility Layer                             │
│              ├─► Semantic Similarity                   │
│              ├─► NLI Entailment                        │
│              ├─► Tokenization                          │
│              ├─► Fulfillment Checking                  │
│              └─► Reporting                             │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Shared Rules Layer                       │
│              (@langpatrol/rules)                         │
│  - Shared lexicons and patterns                          │
└─────────────────────────────────────────────────────────┘
```

## Monorepo Structure

LangPatrol is organized as a pnpm workspace monorepo:

```
langpatrol/
├── packages/
│   ├── engine/          # Core analysis engine (MIT)
│   ├── langpatrol/      # Public SDK (MIT)
│   ├── cli/             # Command-line tool (MIT)
│   └── rules/           # Shared lexicons and patterns (MIT)
├── apps/
│   ├── devserver/       # Express API for testing
│   └── devui/           # React/Vite UI for interactive testing
└── tooling/             # Shared tooling configs
```

### Package Responsibilities

#### `@langpatrol/engine` (Core Engine)
The heart of LangPatrol. Contains:
- **Analysis orchestrator** (`analyze.ts`) - Coordinates rule execution
- **Detection rules** (`rules/`) - Five detection rule implementations
- **Utilities** (`util/`) - Semantic similarity, NLI, tokenization, etc.
- **Type definitions** (`types.ts`) - Core TypeScript types
- **ML models** (`models/`) - Embedded ONNX models for semantic features

**License:** MIT License

#### `langpatrol` (Public SDK)
The public-facing API. Provides:
- **Main entry point** (`analyzePrompt()`) - Async wrapper with semantic feature support
- **Framework adapters** (`adapters/`) - Integrations for LangChain, Vercel AI SDK
- **Re-exports** - Re-exports engine types and utilities

**License:** MIT License

#### `langpatrol-cli` (CLI Tool)
Command-line interface for batch analysis:
- File glob support
- JSON output
- Table formatting
- Model specification

**License:** MIT License

#### `@langpatrol/rules` (Shared Rules)
Shared lexicons and patterns used across rules:
- Noun taxonomies
- Synonym maps
- Pattern definitions

**License:** MIT License

## Core Engine

### Analysis Flow

The core engine follows this flow:

```typescript
Input (AnalyzeInput)
  │
  ├─► Extract text from prompt/messages
  │
  ├─► Run Rules (conditionally based on disabledRules)
  │   ├─► MISSING_PLACEHOLDER (sync)
  │   ├─► MISSING_REFERENCE (sync or async)
  │   ├─► CONFLICTING_INSTRUCTION (sync)
  │   ├─► SCHEMA_RISK (sync)
  │   └─► TOKEN_OVERAGE (sync)
  │
  ├─► Collect timing metadata
  │
  └─► Generate Report
      ├─► Issues (with evidence)
      ├─► Suggestions
      ├─► Cost estimates
      └─► Metadata (timings, trace ID, etc.)
```

### Rule Execution Model

Rules are executed in two modes:

1. **Synchronous** (default) - Fast, pattern-based detection
2. **Asynchronous** (optional) - Semantic features enabled via options

The `MISSING_REFERENCE` rule is special—it has both sync and async versions:
- **Sync version** (`run()`) - Pattern matching only
- **Async version** (`runAsync()`) - Pattern + semantic similarity + NLI

When semantic features are enabled, `analyzePrompt()`:
1. Runs all other rules synchronously
2. Temporarily disables `MISSING_REFERENCE` in the sync run
3. Runs `MISSING_REFERENCE` asynchronously with semantic features
4. Merges results

### Rule Interface

All rules follow this interface:

```typescript
function run(input: AnalyzeInput, acc: Report): void
// or
async function runAsync(input: AnalyzeInput, acc: Report): Promise<void>
```

Rules:
- Read from `input` (prompt, messages, schema, options)
- Write to `acc` (issues, suggestions, cost, meta)
- Are idempotent (can be called multiple times safely)
- Are independent (order doesn't matter)

## Detection Rules

### 1. Missing Placeholder Detection

**Location:** `packages/engine/src/rules/placeholders.ts`

**How it works:**
- Detects template syntax (`{{variable}}`, `<%variable%>`, etc.)
- Supports multiple dialects (Handlebars, Jinja, Mustache, EJS)
- Auto-detects dialect or uses `templateDialect` option
- Reports unresolved variables with positions

**Performance:** <1ms (synchronous, regex-based)

### 2. Missing Reference Detection

**Location:** `packages/engine/src/rules/reference.ts`

**How it works:**
- Detects definite noun phrases ("the report", "this file")
- Detects forward references ("the following list", "as shown below")
- Checks conversation history for antecedents
- Uses multi-stage fulfillment checking (pattern → semantic → NLI)

**Performance:**
- Sync: <1ms (pattern matching only)
- Async: 50-500ms (with semantic features, depending on context length)

**See:** [Missing Reference Detection](./rules/missing-reference.md) for details

### 3. Conflicting Instruction Detection

**Location:** `packages/engine/src/rules/conflicts.ts`

**How it works:**
- Detects verbosity conflicts ("be concise" vs "step by step")
- Detects format conflicts ("JSON only" vs "add commentary")
- Uses regex patterns to find conflicting directives
- Reports pairs of conflicting instructions

**Performance:** <1ms (synchronous, regex-based)

### 4. Schema Risk Detection

**Location:** `packages/engine/src/rules/schemaRisk.ts`

**How it works:**
- Only runs when `schema` is provided
- Detects JSON keywords ("JSON", "json", etc.)
- Detects prose-after-JSON patterns ("add commentary", "include notes")
- Flags when both are present (conflict)

**Performance:** <1ms (synchronous, regex-based)

### 5. Token Overage Detection

**Location:** `packages/engine/src/rules/tokens.ts`

**How it works:**
- Estimates token count using smart heuristics
- Compares against model context window
- Compares against `maxInputTokens` option
- Estimates cost if pricing data available

**Performance:** 
- Cheap mode: <1ms (character-based estimation)
- Exact mode: 10-100ms (actual tokenization with tiktoken)

**See:** [Tokenization](./technical/tokenization.md) for details

## Utility Layer

### Semantic Similarity

**Location:** `packages/engine/src/util/semanticSimilarity.ts`

Uses MiniLM-L6-v2 embeddings to compute cosine similarity between texts.

**Why it's used:**
- Catches paraphrases that pattern matching misses
- "the report" matches "sales document" semantically
- Enables more robust reference fulfillment

**See:** [Semantic Analytics](./technical/semantic-analytics.md) for details

### NLI Entailment

**Location:** `packages/engine/src/util/nliEntailment.ts`

Uses distilbert-base-uncased-mnli for natural language inference.

**Why it's used:**
- Validates logical relationships between texts
- Checks if context "entails" the reference
- More precise than similarity alone

**See:** [NLI Entailment](./technical/nli-entailment.md) for details

### Fulfillment Checking

**Location:** `packages/engine/src/util/fulfillmentChecker.ts`

Orchestrates pattern matching, semantic similarity, and NLI to check if a reference is fulfilled.

**Modes:**
- **Hierarchical** (default) - Run methods sequentially, stop at first match
- **Combined** (optional) - Run all methods in parallel, combine scores

**See:** [Fulfillment Checking](./technical/fulfillment-checking.md) for details

### Tokenization

**Location:** `packages/engine/src/util/tokenize.ts`

Smart token estimation with multiple modes:
- **Cheap** - Character-based estimation (fast)
- **Exact** - Actual tokenization with tiktoken (accurate)
- **Auto** - Uses cheap for small inputs, exact when near limits

**See:** [Tokenization](./technical/tokenization.md) for details

## Data Flow

### Input Types

```typescript
type AnalyzeInput = {
  prompt?: string;              // Single prompt string
  messages?: Msg[];             // Conversation history
  schema?: JSONSchema7;         // JSON schema (optional)
  model?: string;               // Model name (for token limits)
  templateDialect?: string;    // Template dialect hint
  attachments?: Attachment[];   // File attachments (future)
  options?: {...};              // Configuration options
}
```

### Output Types

```typescript
type Report = {
  issues: Issue[];              // Detected issues
  suggestions?: Suggestion[];   // Actionable suggestions
  cost?: ReportCost;            // Token/cost estimates
  meta?: ReportMeta;            // Metadata (timings, trace ID)
  summary?: ReportSummary;       // Summary statistics
}
```

## Performance Characteristics

### Synchronous Rules
- **Placeholder Detection:** <1ms
- **Conflict Detection:** <1ms
- **Schema Risk Detection:** <1ms
- **Token Overage (cheap mode):** <1ms
- **Reference Detection (pattern only):** <1ms

**Total (sync only):** ~5ms for typical prompts

### Asynchronous Rules
- **Semantic Similarity:** 50-200ms (first call includes model load, ~90MB)
- **NLI Entailment:** 100-300ms (first call includes model load, ~250MB)
- **Reference Detection (with semantic):** 100-500ms (depending on context length)

**Models are lazy-loaded and cached** - First call is slower, subsequent calls are faster.

## Extensibility

### Adding a New Rule

1. Create `packages/engine/src/rules/myrule.ts`:

```typescript
import type { AnalyzeInput, Report } from '../types';
import { createIssueId } from '../util/reporting';

export function run(input: AnalyzeInput, acc: Report): void {
  // Your detection logic
  if (detected) {
    acc.issues.push({
      id: createIssueId(),
      code: 'MY_NEW_ISSUE',
      severity: 'medium',
      detail: 'Issue description',
      // ...
    });
  }
}
```

2. Add to `analyze.ts`:

```typescript
import { run as runMyRule } from './rules/myrule';

// In analyze() function:
if (!disabledRules.has('MY_NEW_ISSUE')) {
  runMyRule(input, report);
}
```

3. Add to `types.ts`:

```typescript
export type IssueCode = 
  | 'MISSING_PLACEHOLDER'
  | 'MISSING_REFERENCE'
  | 'CONFLICTING_INSTRUCTION'
  | 'SCHEMA_RISK'
  | 'TOKEN_OVERAGE'
  | 'MY_NEW_ISSUE';  // Add here
```

### Adding a New Utility

Create `packages/engine/src/util/myutil.ts` and export functions. Other rules can import and use it.

## Next Steps

- [Detection Rules](./rules/missing-placeholder.md) - Learn about each rule in detail
- [Technical Deep Dives](./technical/semantic-analytics.md) - Understand the technical implementation
- [API Reference](./api-reference.md) - Complete API documentation

