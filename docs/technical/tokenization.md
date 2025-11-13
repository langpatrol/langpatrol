# Tokenization

## Overview

Tokenization is the process of converting text into tokens that LLMs can process. LangPatrol uses smart token estimation to detect when prompts exceed model context windows or cost limits, helping prevent API errors and unexpected costs.

## Why Token Estimation?

### The Problem

LLMs have **context windows** - maximum token limits for input:
- GPT-4: 128k tokens
- Claude 3: 200k tokens
- GPT-3.5: 16k tokens

If your prompt exceeds the context window:
- API call fails
- Wasted API credits
- Poor user experience

### The Solution

LangPatrol estimates token counts before sending to the API, allowing you to:
- Catch overages early
- Estimate costs
- Optimize prompts

## Token Estimation Modes

LangPatrol supports three token estimation modes:

### 1. Cheap Mode (Fast)

Uses character-based estimation:

```typescript
tokens ≈ characters / 4
```

**Advantages:**
- Very fast (<1ms)
- No dependencies
- Good for rough estimates

**Disadvantages:**
- Less accurate (can be ±20-30% off)
- Doesn't account for tokenization differences

**When to use:**
- Quick checks
- Large inputs where exact count isn't needed
- When speed is critical

### 2. Exact Mode (Accurate)

Uses actual tokenization with `js-tiktoken`:

```typescript
import { encoding_for_model } from 'js-tiktoken';

const encoding = encoding_for_model(model);
const tokens = encoding.encode(text).length;
```

**Advantages:**
- Very accurate (matches OpenAI's tokenization)
- Model-specific (different models tokenize differently)

**Disadvantages:**
- Slower (10-100ms depending on text length)
- Requires model name

**When to use:**
- Need exact counts
- Near context window limits
- Cost estimation

### 3. Auto Mode (Smart Default)

Intelligently chooses between cheap and exact:

```typescript
// Auto mode logic
const window = getModelWindow(model);
const cheapEstimate = cheapTokensApprox(text);

if (cheapEstimate < 0.6 * window) {
  // Well below limit - use cheap estimate
  return { tokens: cheapEstimate, method: 'cheap' };
}

if (cheapEstimate > 1.1 * window) {
  // Well above limit - flag overage without exact count
  return { tokens: cheapEstimate, method: 'cheap_over' };
}

// Near boundary - use exact tokenization for precision
return { tokens: exactTokens(text, model), method: 'exact_boundary' };
```

**Advantages:**
- Fast for most cases
- Accurate when it matters (near limits)
- Best of both worlds

**Disadvantages:**
- Slightly more complex

**When to use:**
- Default behavior
- Best balance of speed and accuracy

## Implementation

### Token Estimation Function

```typescript
export function estimateTokensAuto(
  text: string,
  model?: string,
  mode: TokenEstimationMode = 'auto'
): TokenEstimate {
  if (mode === 'off') {
    return { tokens: 0, method: 'off' };
  }

  if (mode === 'cheap') {
    return { tokens: cheapTokensApprox(text), method: 'cheap' };
  }

  if (mode === 'exact') {
    return { tokens: exactTokens(text, model), method: 'exact' };
  }

  // Auto mode: two-level rule
  const window = getModelWindow(model);
  const est = cheapTokensApprox(text);

  // Fast path: well below limit
  if (est < 0.6 * window) {
    return { tokens: est, method: 'cheap' };
  }

  // Fast path: well above limit
  if (est > 1.1 * window) {
    return { tokens: est, method: 'cheap_over' };
  }

  // Near boundary: use exact tokenization
  return { tokens: exactTokens(text, model), method: 'exact_boundary' };
}
```

### Exact Tokenization

```typescript
export function exactTokens(text: string, model?: string): number {
  if (!model) {
    // Fallback to cheap estimation if no model
    return cheapTokensApprox(text);
  }

  try {
    const encoding = encoding_for_model(model);
    return encoding.encode(text).length;
  } catch (error) {
    // Fallback to cheap estimation if model not supported
    console.warn(`Model ${model} not supported, using cheap estimation`);
    return cheapTokensApprox(text);
  }
}
```

### Cheap Estimation

```typescript
function cheapTokensApprox(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  // This is a heuristic based on English text
  return Math.ceil(text.length / 4);
}
```

## Model Support

LangPatrol supports tokenization for models that use:
- **OpenAI's tiktoken** - GPT-3, GPT-4, GPT-4 Turbo, etc.
- **Claude models** - Uses approximate estimation (Claude uses different tokenization)

### Supported Models

```typescript
const SUPPORTED_MODELS = [
  'gpt-4',
  'gpt-4-turbo',
  'gpt-4o',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
  // ... more models
];
```

For unsupported models, LangPatrol falls back to cheap estimation.

## Context Window Detection

LangPatrol knows the context windows for common models:

```typescript
export function getModelWindow(model?: string): number | undefined {
  if (!model) return undefined;

  const windows: Record<string, number> = {
    'gpt-4': 128_000,
    'gpt-4-turbo': 128_000,
    'gpt-4o': 128_000,
    'gpt-3.5-turbo': 16_384,
    'gpt-3.5-turbo-16k': 16_384,
    'claude-3-opus': 200_000,
    'claude-3-sonnet': 200_000,
    'claude-3-haiku': 200_000,
    // ... more models
  };

  return windows[model.toLowerCase()];
}
```

## Cost Estimation

LangPatrol can estimate API costs if pricing data is available:

```typescript
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number | undefined {
  const pricing = getModelPricing(model);
  if (!pricing) return undefined;

  return (
    (inputTokens / 1_000_000) * pricing.inputUSDPerMillion +
    (outputTokens / 1_000_000) * pricing.outputUSDPerMillion
  );
}
```

### Pricing Data

```typescript
const PRICING: Record<string, { inputUSDPerMillion: number; outputUSDPerMillion: number }> = {
  'gpt-4': {
    inputUSDPerMillion: 30.0,
    outputUSDPerMillion: 60.0
  },
  'gpt-4-turbo': {
    inputUSDPerMillion: 10.0,
    outputUSDPerMillion: 30.0
  },
  // ... more models
};
```

## Usage in LangPatrol

### Token Overage Detection

The `TOKEN_OVERAGE` rule uses token estimation to detect:
1. **Context window violations** - Prompts exceeding model limits
2. **Cost limit violations** - Prompts exceeding `maxCostUSD`
3. **Input token limit violations** - Prompts exceeding `maxInputTokens`

### Example

```typescript
const report = await analyzePrompt({
  prompt: veryLongPrompt,
  model: 'gpt-4o',
  options: {
    maxInputTokens: 100_000,
    tokenEstimation: 'auto'
  }
});

if (report.issues.some(i => i.code === 'TOKEN_OVERAGE')) {
  console.log('Prompt exceeds token limit!');
  console.log(`Estimated tokens: ${report.cost?.estInputTokens}`);
}
```

## Configuration

### Token Estimation Mode

```typescript
{
  options: {
    tokenEstimation: 'auto' | 'cheap' | 'exact' | 'off'
  }
}
```

- **`auto`** (default) - Smart selection based on context
- **`cheap`** - Fast character-based estimation
- **`exact`** - Accurate tokenization with tiktoken
- **`off`** - Disable token estimation

### Limits

```typescript
{
  options: {
    maxInputTokens: 100_000,      // Max input tokens
    maxCostUSD: 0.10,              // Max cost in USD
    maxChars: 120_000              // Early bail for huge inputs
  }
}
```

## Performance

### Cheap Mode
- **Latency:** <1ms
- **Accuracy:** ±20-30%

### Exact Mode
- **Latency:** 10-100ms (depends on text length)
- **Accuracy:** ±1-2%

### Auto Mode
- **Latency:** <1ms (most cases), 10-100ms (near limits)
- **Accuracy:** ±1-2% (when it matters)

## Best Practices

### 1. Use Auto Mode (Default)
Auto mode provides the best balance of speed and accuracy.

### 2. Set Reasonable Limits
```typescript
{
  options: {
    maxInputTokens: modelContextWindow * 0.9,  // Leave 10% buffer
    maxCostUSD: 0.10  // Set based on your budget
  }
}
```

### 3. Handle Large Inputs
For very large inputs (>120k chars), LangPatrol uses early bail to avoid slow tokenization:

```typescript
{
  options: {
    maxChars: 120_000  // Skip exact tokenization for huge inputs
  }
}
```

### 4. Monitor Costs
Use cost estimation to track spending:

```typescript
if (report.cost?.estUSD) {
  console.log(`Estimated cost: $${report.cost.estUSD.toFixed(4)}`);
}
```

## Limitations

1. **Model support** - Exact tokenization only works for OpenAI models
2. **Claude models** - Uses approximate estimation (different tokenization)
3. **Output tokens** - Estimates output tokens as 20% of input (heuristic)
4. **Pricing** - Pricing data may be outdated (models change pricing)

## Next Steps

- [Token Overage Detection](../rules/token-overage.md) - See how tokenization is used
- [API Reference](../api-reference.md) - Complete API documentation

