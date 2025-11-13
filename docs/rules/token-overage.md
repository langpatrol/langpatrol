# Token Overage Detection

## Overview

The Token Overage Detection rule estimates token counts and detects when prompts exceed model context windows or cost limits. This helps prevent API errors and unexpected costs before sending prompts to LLMs.

## Why This Matters

When prompts exceed context windows:
- **API call failures** - The API rejects the request
- **Wasted credits** - Failed requests still consume API credits
- **Poor user experience** - Errors instead of results

When prompts exceed cost limits:
- **Unexpected bills** - Costs can spiral out of control
- **Budget overruns** - Exceed allocated budgets
- **Resource waste** - Paying for unusable requests

## How It Works

### 1. Token Estimation

Uses smart token estimation with multiple modes:

- **Cheap mode** - Character-based estimation (fast, approximate)
- **Exact mode** - Actual tokenization with tiktoken (accurate)
- **Auto mode** - Intelligently chooses between cheap and exact

See [Tokenization](../technical/tokenization.md) for details.

### 2. Limit Checking

Compares estimated tokens against:

- **Model context window** - Maximum tokens the model supports
- **maxInputTokens option** - Custom token limit
- **maxCostUSD option** - Cost limit in USD

### 3. Early Bail

For very large inputs (>120k chars), uses early bail to avoid slow tokenization:

```typescript
if (charCount > maxChars) {
  // Skip exact tokenization, use character estimate
  // Report overage based on character count
}
```

### 4. Cost Estimation

If pricing data is available, estimates API costs:

```typescript
const estUSD = estimateCost(estInputTokens, estOutputTokens, model);
if (estUSD > maxCostUSD) {
  // Report cost overage
}
```

## Examples

### Example 1: Context Window Violation

```typescript
const report = await analyzePrompt({
  prompt: veryLongPrompt,  // 150k tokens
  model: 'gpt-3.5-turbo'   // 16k context window
});

// Detects: 150k tokens > 16k limit
```

**Report:**
```json
{
  "issues": [{
    "code": "TOKEN_OVERAGE",
    "severity": "medium",
    "detail": "Estimated 150,000 input tokens exceeds 16,384 token limit for gpt-3.5-turbo.",
    "evidence": {
      "summary": [{ "text": "token-limit", "count": 1 }],
      "occurrences": [{
        "text": "est=150000",
        "start": 0,
        "end": 0
      }]
    }
  }],
  "suggestions": [{
    "type": "TRIM_CONTEXT",
    "text": "Context exceeds soft limit. Summarize older turns or drop large traces before sending."
  }],
  "cost": {
    "estInputTokens": 150000,
    "method": "exact"
  },
  "meta": {
    "contextWindow": 16384
  }
}
```

### Example 2: Cost Limit Violation

```typescript
const report = await analyzePrompt({
  prompt: veryLongPrompt,
  model: 'gpt-4',
  options: {
    maxCostUSD: 0.10
  }
});

// Detects: Estimated cost $0.15 > $0.10 limit
```

**Report:**
```json
{
  "issues": [{
    "code": "TOKEN_OVERAGE",
    "severity": "medium",
    "detail": "Estimated cost $0.1500 exceeds max cost $0.10.",
    "evidence": {
      "summary": [{ "text": "cost-limit", "count": 1 }],
      "occurrences": [{
        "text": "estUSD=$0.1500",
        "start": 0,
        "end": 0
      }]
    }
  }],
  "suggestions": [{
    "type": "TRIM_CONTEXT",
    "text": "Reduce prompt size or lower completion length to stay within budget."
  }],
  "cost": {
    "estInputTokens": 50000,
    "estOutputTokens": 25000,
    "estUSD": 0.15
  }
}
```

### Example 3: Character Limit Early Bail

```typescript
const report = await analyzePrompt({
  prompt: hugePrompt,  // 200k characters
  model: 'gpt-4',
  options: {
    maxChars: 120_000
  }
});

// Early bail: 200k chars > 120k limit
// Uses character-based estimation instead of exact tokenization
```

### Example 4: Multi-Turn Messages

```typescript
const report = await analyzePrompt({
  messages: [
    { role: 'user', content: 'Message 1...' },
    { role: 'assistant', content: 'Response 1...' },
    { role: 'user', content: 'Message 2...' }
  ],
  model: 'gpt-4'
});

// Estimates tokens for each message
// Sums total and compares against context window
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

### Disabling the Rule

```typescript
{
  options: {
    disabledRules: ['TOKEN_OVERAGE']
  }
}
```

## Performance

### Token Estimation
- **Cheap mode:** <1ms
- **Exact mode:** 10-100ms (depends on text length)
- **Auto mode:** <1ms (most cases), 10-100ms (near limits)

### Early Bail
- **Character check:** <1ms
- **Avoids slow tokenization** for huge inputs

## Best Practices

### 1. Set Reasonable Limits

```typescript
{
  options: {
    maxInputTokens: modelContextWindow * 0.9,  // Leave 10% buffer
    maxCostUSD: 0.10  // Set based on your budget
  }
}
```

### 2. Use Auto Mode (Default)

Auto mode provides the best balance of speed and accuracy:

```typescript
{
  options: {
    tokenEstimation: 'auto'  // Default, recommended
  }
}
```

### 3. Monitor Costs

Use cost estimation to track spending:

```typescript
if (report.cost?.estUSD) {
  console.log(`Estimated cost: $${report.cost.estUSD.toFixed(4)}`);
  
  if (report.cost.estUSD > budget) {
    // Alert or reject
  }
}
```

### 4. Handle Large Inputs

For very large inputs, use early bail:

```typescript
{
  options: {
    maxChars: 120_000  // Skip exact tokenization for huge inputs
  }
}
```

## Integration Examples

### Pre-flight Validation

```typescript
async function validatePromptSize(prompt: string, model: string) {
  const report = await analyzePrompt({
    prompt,
    model,
    options: {
      maxInputTokens: 100_000,
      maxCostUSD: 0.10
    }
  });
  
  const overages = report.issues.filter(
    i => i.code === 'TOKEN_OVERAGE'
  );
  
  if (overages.length > 0) {
    console.warn('Token overage detected:');
    overages.forEach(issue => {
      console.warn(`- ${issue.detail}`);
    });
    
    // Optionally throw or return warnings
    throw new Error('Prompt exceeds token or cost limits');
  }
  
  return report.cost;
}
```

### Cost Tracking

```typescript
async function trackCost(prompt: string, model: string) {
  const report = await analyzePrompt({ prompt, model });
  
  if (report.cost?.estUSD) {
    // Log cost
    console.log(`Estimated cost: $${report.cost.estUSD.toFixed(4)}`);
    
    // Track in analytics
    analytics.track('prompt_cost_estimated', {
      model,
      tokens: report.cost.estInputTokens,
      cost: report.cost.estUSD
    });
  }
}
```

## Limitations

1. **Model support** - Exact tokenization only works for OpenAI models
2. **Claude models** - Uses approximate estimation (different tokenization)
3. **Output tokens** - Estimates output tokens as 20% of input (heuristic)
4. **Pricing** - Pricing data may be outdated (models change pricing)

## Related Rules

- [Missing Placeholder Detection](./missing-placeholder.md) - Detects unresolved template variables
- [Missing Reference Detection](./missing-reference.md) - Detects references without antecedents

## Next Steps

- [Tokenization](../technical/tokenization.md) - Learn about token estimation in detail
- [API Reference](../api-reference.md) - Complete API documentation

