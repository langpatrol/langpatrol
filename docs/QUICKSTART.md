# Quick Start Guide

## Installation

```bash
npm install langpatrol
```

## Basic Usage

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Summarize the report.',
  model: 'gpt-5'
});

console.log(report.issues);
```

## With Message History

```typescript
const report = await analyzePrompt({
  messages: [
    { role: 'user', content: 'Here is the sales report: Q3 revenue was $1M' },
    { role: 'user', content: 'Summarize the report.' }
  ],
  model: 'gpt-5'
});
```

## With JSON Schema

```typescript
const report = await analyzePrompt({
  prompt: 'Return user data as JSON.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' }
    }
  },
  model: 'gpt-5'
});
```

## CLI Usage

```bash
# Install CLI globally
npm install -g langpatrol-cli

# Analyze a prompt file
langpatrol analyze prompt.txt

# Output JSON report
langpatrol analyze prompt.txt --json --out report.json
```

## What Gets Detected

LangPatrol detects five categories of issues:

1. **MISSING_PLACEHOLDER** - Unresolved template variables like `{{customer_name}}`
2. **MISSING_REFERENCE** - References to "the report" or "continue the list" without prior context
3. **CONFLICTING_INSTRUCTION** - Contradictory directives like "be concise" and "give detailed explanation"
4. **SCHEMA_RISK** - Prompts requesting JSON but allowing prose commentary
5. **TOKEN_OVERAGE** - Estimated tokens exceeding model context window

## Next Steps

- Read the [API documentation](../packages/langpatrol/README.md)
- Check out [adapter examples](../packages/langpatrol/src/adapters/)
- Try the [dev UI](../apps/devui/) for interactive testing

