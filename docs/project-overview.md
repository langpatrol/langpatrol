# Project Overview

## What is LangPatrol?

LangPatrol is a developer SDK for pre-inference prompt validation and linting. Think of it as **ESLint or Prettier, but for prompts sent to large language models**.

Before your application sends a prompt to an LLM (like GPT-4, Claude, or any other model), LangPatrol runs a fast, local analysis to catch common prompt bugs that waste tokens or produce unreliable outputs.

## Why LangPatrol?

### The Problem

When building applications with LLMs, developers often encounter issues with prompts that:

1. **Waste tokens** - Unresolved template variables like `{{customer_name}}` get sent to the model
2. **Cause confusion** - References to "the report" or "continue the list" without prior context
3. **Produce inconsistent results** - Contradictory instructions like "be concise" and "give detailed explanation"
4. **Break parsing** - Requests for JSON output mixed with prose instructions
5. **Exceed limits** - Prompts that are too long for the model's context window

These issues lead to:
- Higher API costs (wasted tokens)
- Unreliable outputs
- Poor user experience
- Debugging headaches

### The Solution

LangPatrol provides **local, fast validation** that catches these issues before they reach the LLM. It runs entirely in your environment—no external API calls, no data leaving your system.

## Key Features

### 1. Fast Local Analysis
- Runs entirely in your environment
- No external API calls
- No data sent to third parties
- Sub-millisecond to low-millisecond latency for most checks

### 2. Six Detection Categories

LangPatrol detects six categories of issues:

1. **MISSING_PLACEHOLDER** - Unresolved template variables (e.g., `{{customer_name}}` not filled)
2. **MISSING_REFERENCE** - Deictic references ("the report", "continue the list") with no prior content
3. **CONFLICTING_INSTRUCTION** - Contradictory directives ("be concise" and "give a detailed explanation")
4. **SCHEMA_RISK** - Prompts requesting JSON but also prose or commentary around it
5. **TOKEN_OVERAGE** - Estimated token length exceeding model context or cost limits
6. **OUT_OF_CONTEXT** - Prompts that don't match your domain activity (cloud-only, requires AI Analytics)

### 3. Advanced Semantic Analysis

For missing reference detection, LangPatrol uses advanced NLP techniques:

- **Pattern Matching** - Fast exact/synonym matching (default, synchronous)
- **Semantic Similarity** - Embedding-based paraphrase detection (optional, async)
- **NLI Entailment** - Natural Language Inference for logical validation (optional, async)
- **NLP Extraction** - Dynamic noun extraction using NER models (optional)

### 4. Flexible Integration

- **SDK** - Simple TypeScript/JavaScript API
- **CLI** - Command-line tool for batch analysis
- **Adapters** - Framework integrations (LangChain, Vercel AI SDK)
- **Configurable** - Fine-tune detection sensitivity and methods
- **Cloud API** - Optional cloud-based AI Analytics for advanced features (domain context checking)

## Installation

```bash
npm install langpatrol
```

Or install the CLI globally:

```bash
npm install -g langpatrol-cli
```

## Basic Usage

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Summarize the report.',
  model: 'gpt-4o'
});

if (report.issues.length) {
  console.log('Issues found:', report.issues);
}
```

## How It Works

LangPatrol follows a simple workflow:

1. **Input** - You provide a prompt (or messages) and optional configuration
2. **Analysis** - LangPatrol runs five detection rules in parallel
3. **Report** - You receive a structured report with issues, suggestions, and metadata

```
┌─────────────┐
│   Prompt    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  LangPatrol     │
│  Analysis       │
│  Engine         │
└──────┬──────────┘
       │
       ├─► Placeholder Detection
       ├─► Reference Detection
       ├─► Conflict Detection
       ├─► Schema Risk Detection
       ├─► Token Overage Detection
       └─► Domain Context Detection (cloud-only)
       │
       ▼
┌─────────────┐
│   Report    │
│  (Issues,   │
│ Suggestions)│
└─────────────┘
```

## Use Cases

### 1. Pre-flight Validation
Validate prompts before sending to LLMs to catch errors early:

```typescript
const report = await analyzePrompt({ prompt, model });
if (report.issues.length) {
  // Handle issues before API call
  throw new Error('Invalid prompt detected');
}
```

### 2. Development Testing
Use in development to catch prompt issues during testing:

```typescript
// In your test suite
test('prompt has no unresolved placeholders', async () => {
  const report = await analyzePrompt({ prompt: myPrompt, model: 'gpt-4o' });
  expect(report.issues.filter(i => i.code === 'MISSING_PLACEHOLDER')).toHaveLength(0);
});
```

### 3. CI/CD Integration
Add to your CI pipeline to prevent bad prompts from being deployed:

```bash
# In your CI script
langpatrol analyze "prompts/**/*.txt" --json --out report.json
```

### 4. Interactive Development
Use the dev UI (`apps/devui`) for interactive prompt testing and debugging.

## Design Principles

### 1. Local-First
- All analysis happens locally
- No external dependencies for core functionality
- Optional ML models are lazy-loaded and cached

### 2. Fast by Default
- Synchronous rules run in <1ms
- Async rules (semantic features) are opt-in
- Smart token estimation (cheap for small inputs, exact only when needed)

### 3. Configurable
- Enable/disable individual rules
- Tune detection sensitivity
- Choose analysis methods (pattern matching, semantic, NLI, or combined)

### 4. Developer-Friendly
- Clear error messages
- Actionable suggestions
- Rich evidence in reports
- TypeScript support

## License

LangPatrol is fully open-source:

- **Public SDK** (`langpatrol`, `langpatrol-cli`) - MIT License
- **Core Engine** (`@langpatrol/engine`) - MIT License
- **All packages** - MIT License

See [LICENSE-FAQ.md](./LICENSE-FAQ.md) for details.

## Next Steps

- [Quick Start Guide](./QUICKSTART.md) - Get started in 5 minutes
- [Architecture Overview](./architecture.md) - Understand the system design
- [API Reference](./api-reference.md) - Complete API documentation
- [Detection Rules](./rules/missing-placeholder.md) - Learn about each detection rule

