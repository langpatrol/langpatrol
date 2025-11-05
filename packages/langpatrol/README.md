# LangPatrol

Developer SDK for pre-inference prompt validation and linting — think of it as ESLint or Prettier, but for prompts sent to large language models.

## Installation

```bash
npm install langpatrol
```

## Quick Start

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Continue the list.',
  messages: [{ role: 'user', content: 'Continue the list.' }],
  model: 'gpt-5'
});

if (report.issues.length) {
  console.log('Issues found:', report.issues);
}
```

## API

### `analyzePrompt(input: AnalyzeInput): Promise<Report>`

Analyzes a prompt or message history and returns a report with issues and suggestions.

**Input:**
- `prompt?: string` - Single prompt string
- `messages?: Msg[]` - Chat message history
- `schema?: JSONSchema7` - Optional JSON schema
- `model?: string` - Model name for token estimation
- `templateDialect?: 'handlebars' | 'jinja' | 'mustache' | 'ejs'` - Template dialect
- `attachments?: Attachment[]` - File attachments metadata
- `options?: { maxCostUSD?: number; maxInputTokens?: number; referenceHeads?: string[] }`

**Output:**
- `issues: Issue[]` - Detected issues
- `suggestions: Suggestion[]` - Suggested fixes
- `cost?: { estInputTokens: number; estUSD?: number }` - Cost estimates
- `meta?: { latencyMs: number; modelHint?: string }` - Metadata

## Issue Codes

- `MISSING_PLACEHOLDER` - Unresolved template variables
- `MISSING_REFERENCE` - Deictic references without context
- `CONFLICTING_INSTRUCTION` - Contradictory directives
- `SCHEMA_RISK` - JSON schema mismatches
- `TOKEN_OVERAGE` - Token limits exceeded

## Examples

### Vercel AI SDK

```typescript
import { analyzePrompt } from 'langpatrol';

export async function guardedCall(messages, model) {
  const report = await analyzePrompt({ messages, model });
  
  if (report.issues.find(i => i.code === 'TOKEN_OVERAGE')) {
    // Summarize or trim, then proceed
  }
  
  // Then call your model
}
```

## License

MIT

