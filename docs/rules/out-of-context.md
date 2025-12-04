# Out of Context Detection

## Overview

The Out of Context Detection rule validates that user prompts match your specified domain of activity. This is a **cloud-only feature** that uses AI-powered analysis to determine if a prompt is relevant to your application's domain.

## Why This Matters

Prompts that are completely unrelated to your domain can lead to:
- **Wasted API calls** - Processing irrelevant requests
- **Security concerns** - Users attempting to use your system for unintended purposes
- **Poor user experience** - Confusing or irrelevant responses
- **Resource waste** - Consuming API quota on non-domain requests

## Requirements

- **Cloud API Key** - Must provide `apiKey` in options
- **AI Analytics Subscription** - Requires Pro tier or higher with AI Analytics feature
- **Domain Keywords** - Provide a list of domain keywords/topics

## How It Works

### 1. Domain Configuration

Specify your domain of activity using the `check_context` option:

```typescript
const report = await analyzePrompt({
  prompt: 'How do I cook pasta?',
  options: {
    apiKey: 'lp_your_api_key_here',
    apiBaseUrl: 'https://api.langpatrol.com',
    check_context: {
      domains: ['salesforce', 'CRM', 'business automation', 'customer management']
    }
  }
});
```

### 2. AI-Powered Analysis

When `check_context` is provided:
- The SDK automatically routes to the `/api/v1/ai-analytics` endpoint
- OpenAI analyzes the prompt against your domain keywords
- Returns `OUT_OF_CONTEXT` error if the prompt is unrelated

### 3. Error Detection

If the prompt doesn't match your domain, you'll receive:

```typescript
{
  code: 'OUT_OF_CONTEXT',
  severity: 'high',
  detail: 'The prompt is not relevant to the specified domain: salesforce, CRM, business automation',
  confidence: 'high'
}
```

## Examples

### Valid Domain Prompt

```typescript
const report = await analyzePrompt({
  prompt: 'Create a Salesforce report for Q3 sales',
  options: {
    apiKey: 'lp_your_key',
    check_context: {
      domains: ['salesforce', 'CRM']
    }
  }
});
// ✅ No OUT_OF_CONTEXT error - prompt matches domain
```

### Invalid Domain Prompt

```typescript
const report = await analyzePrompt({
  prompt: 'How do I bake a cake?',
  options: {
    apiKey: 'lp_your_key',
    check_context: {
      domains: ['salesforce', 'CRM']
    }
  }
});
// ❌ OUT_OF_CONTEXT error - cooking is not related to Salesforce/CRM
```

### Multi-Domain Support

```typescript
const report = await analyzePrompt({
  prompt: 'Analyze customer data',
  options: {
    apiKey: 'lp_your_key',
    check_context: {
      domains: [
        'salesforce',
        'CRM',
        'business automation',
        'customer management',
        'data analysis'
      ]
    }
  }
});
// ✅ Matches multiple domain keywords
```

## Best Practices

### 1. Use Specific Keywords

**Good:**
```typescript
domains: ['salesforce', 'CRM', 'customer relationship management', 'lead generation']
```

**Less Effective:**
```typescript
domains: ['business', 'software', 'data'] // Too generic
```

### 2. Include Related Terms

Include synonyms and related concepts:
```typescript
domains: [
  'salesforce',
  'CRM',
  'customer management',
  'lead tracking',
  'sales pipeline',
  'account management'
]
```

### 3. Consider User Intent

Include terms that represent what users should be doing:
```typescript
domains: [
  'salesforce',
  'create report',
  'manage contacts',
  'track opportunities',
  'analyze sales data'
]
```

## Error Handling

```typescript
const report = await analyzePrompt({
  prompt: userInput,
  options: {
    apiKey: 'lp_your_key',
    check_context: { domains: ['salesforce', 'CRM'] }
  }
});

const outOfContext = report.issues.find(i => i.code === 'OUT_OF_CONTEXT');
if (outOfContext) {
  // Prompt is not relevant to your domain
  return {
    error: 'This prompt is not relevant to our domain. Please rephrase.',
    issue: outOfContext
  };
}
```

## Limitations

1. **Cloud-only** - Not available in local mode
2. **Requires subscription** - Needs AI Analytics feature (Pro tier or higher)
3. **AI-based** - Uses OpenAI for analysis, so there may be edge cases
4. **Cost** - Each check consumes AI Analytics quota

## Integration

### With API Key Validation

```typescript
if (!input.options?.apiKey) {
  throw new Error('check_context requires an apiKey');
}

const report = await analyzePrompt({
  prompt: userPrompt,
  options: {
    apiKey: process.env.LANGPATROL_API_KEY,
    check_context: {
      domains: ['salesforce', 'CRM']
    }
  }
});
```

### Automatic Routing

When `check_context` is provided, the SDK automatically:
- Routes to `/api/v1/ai-analytics` instead of `/api/v1/analyze`
- Validates that `apiKey` is present
- Passes domain keywords to the cloud API

## See Also

- [API Reference](../api-reference.md) - Complete API documentation
- [Quick Start Guide](../QUICKSTART.md) - Getting started with LangPatrol
- [Cloud API Documentation](../../../cloud/README.md) - Cloud API features

