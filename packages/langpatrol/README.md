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
- `options?: { 
    maxCostUSD?: number; 
    maxInputTokens?: number; 
    referenceHeads?: string[]; 
    apiKey?: string; // API key for cloud API
    apiBaseUrl?: string; // Base URL for cloud API (default: 'http://localhost:3000')
    check_context?: { // Domain context checking (cloud-only, requires apiKey and AI Analytics subscription)
      domains: string[]; // List of domain keywords/topics to validate the prompt against
    };
  }`

**Output:**
- `issues: Issue[]` - Detected issues
- `suggestions: Suggestion[]` - Suggested fixes
- `cost?: { estInputTokens: number; estUSD?: number }` - Cost estimates
- `meta?: { latencyMs: number; modelHint?: string }` - Metadata

### `optimizePrompt(input: OptimizeInput): Promise<OptimizeResponse>`

Optimizes (compresses) a user prompt to help reduce token usage. This is a cloud-only feature and requires an API key.

**Input:**
- `prompt: string` - The prompt text to optimize
- `model?: string` - Optional target model name
- `options?: { 
    apiKey: string;            // Required: cloud API key
    apiBaseUrl?: string;       // Optional: base URL for cloud API (default: 'http://localhost:3000')
  }`

**Output:**
- `optimized_prompt: string` - Optimized prompt text
- `ratio: string` - Compression ratio (e.g., "33.00%")
- `origin_tokens: number` - Original token count
- `optimized_tokens: number` - Optimized token count

**Example:**
```typescript
import { optimizePrompt } from 'langpatrol';

const optimized = await optimizePrompt({
  prompt: 'Write a detailed project proposal for building a new mobile app...',
  model: 'gpt-4',
  options: {
    apiKey: process.env.LANGPATROL_API_KEY!,
    apiBaseUrl: 'https://api.langpatrol.com' // optional override
  }
});

console.log('Compressed prompt:', optimized.compressed);
console.log('Ratio:', optimized.ratio);
console.log('Tokens:', optimized.origin_tokens, '->', optimized.optimized_tokens);
```

## Issue Codes

- `MISSING_PLACEHOLDER` - Unresolved template variables
- `MISSING_REFERENCE` - Deictic references without context
- `CONFLICTING_INSTRUCTION` - Contradictory directives
- `SCHEMA_RISK` - JSON schema mismatches
- `INVALID_SCHEMA` - Invalid JSON Schema structure
- `TOKEN_OVERAGE` - Token limits exceeded
- `OUT_OF_CONTEXT` - Prompt doesn't match specified domain activity (cloud-only, requires `check_context` option)

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

### Domain Context Checking (Cloud-only)

Validate that prompts match your domain activity using the `check_context` option. This feature requires an API key and AI Analytics subscription.

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Generate a marketing email for our SaaS product',
  model: 'gpt-4',
  options: {
    apiKey: 'your-api-key',
    check_context: {
      domains: ['saas', 'marketing', 'email', 'software'] // Domain keywords/topics
    }
  }
});

if (report.issues.find(i => i.code === 'OUT_OF_CONTEXT')) {
  console.warn('Prompt is out of context for your domain');
  // Handle out-of-context prompt
}
```

**Note:** The `check_context` option:
- Requires an `apiKey` to be provided
- Automatically routes to the `/api/v1/ai-analytics` endpoint
- Returns a high-severity `OUT_OF_CONTEXT` error when the prompt doesn't match the specified domains
- Requires an AI Analytics subscription on the cloud API

## License

Elastic License 2.0


