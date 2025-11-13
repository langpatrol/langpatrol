# Missing Placeholder Detection

## Overview

The Missing Placeholder Detection rule identifies unresolved template variables in prompts. These are placeholders like `{{customer_name}}` or `<%product_id%>` that haven't been filled in before sending to the LLM.

## Why This Matters

Unresolved placeholders in prompts lead to:
- **Wasted tokens** - The literal placeholder text gets sent to the model
- **Confusing outputs** - The model may try to interpret the placeholder syntax
- **Broken functionality** - Your application expects a value but gets a placeholder

## How It Works

### 1. Template Dialect Detection

The rule automatically detects the template dialect or uses the `templateDialect` option:

**Supported Dialects:**
- **Handlebars** - `{{variable}}`
- **Mustache** - `{{variable}}` (same as Handlebars)
- **Jinja** - `{{variable}}`
- **EJS** - `<%variable%>`

**Auto-Detection:**
- Tests for `{{` patterns → Handlebars/Mustache/Jinja
- Tests for `<%` patterns → EJS
- Falls back to `templateDialect` option if provided

### 2. Pattern Matching

Uses regex patterns to find placeholders:

```typescript
// Handlebars/Mustache
const PLACEHOLDER_HANDLEBARS = /\{\{\s*([#/>!&^]?)([a-zA-Z0-9_.]+)\s*\}\}/g;

// Jinja
const PLACEHOLDER_JINJA = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

// EJS
const PLACEHOLDER_EJS = /<%\s*([a-zA-Z0-9_.]+)\s*%>/g;
```

### 3. Variable Extraction

Extracts variable names from placeholders:
- `{{customer_name}}` → `customer_name`
- `<%product_id%>` → `product_id`
- `{{user.email}}` → `user.email` (supports dot notation)

### 4. Issue Reporting

For each unresolved placeholder, reports:
- Variable name
- Occurrence count
- Positions in text
- Preview snippets

## Examples

### Example 1: Basic Detection

```typescript
const report = await analyzePrompt({
  prompt: 'Hello {{customer_name}}, your order {{order_id}} is ready.',
  templateDialect: 'handlebars'
});

// Detects:
// - customer_name (unresolved)
// - order_id (unresolved)
```

**Report:**
```json
{
  "issues": [{
    "code": "MISSING_PLACEHOLDER",
    "severity": "high",
    "detail": "Unresolved placeholders: customer_name, order_id",
    "evidence": {
      "summary": [
        { "text": "customer_name", "count": 1 },
        { "text": "order_id", "count": 1 }
      ],
      "occurrences": [
        {
          "text": "{{customer_name}}",
          "start": 6,
          "end": 22,
          "preview": "Hello {{customer_name}}, your order..."
        },
        {
          "text": "{{order_id}}",
          "start": 35,
          "end": 47,
          "preview": "...order {{order_id}} is ready."
        }
      ]
    }
  }]
}
```

### Example 2: Auto-Detection

```typescript
const report = await analyzePrompt({
  prompt: 'Process order <%order_id%> for customer <%customer_id%>.'
  // No templateDialect needed - auto-detects EJS
});

// Detects EJS placeholders automatically
```

### Example 3: Multiple Occurrences

```typescript
const report = await analyzePrompt({
  prompt: 'Welcome {{user_name}}! Your balance is {{user_name}}.'
});

// Reports:
// - user_name (×2 occurrences)
```

### Example 4: Nested Variables

```typescript
const report = await analyzePrompt({
  prompt: 'User {{user.name}} has {{user.email}}.'
});

// Detects:
// - user.name
// - user.email
```

## Configuration

### Template Dialect

```typescript
{
  templateDialect: 'handlebars' | 'jinja' | 'mustache' | 'ejs'
}
```

**When to specify:**
- When auto-detection fails
- When using non-standard syntax
- When you want explicit control

### Disabling the Rule

```typescript
{
  options: {
    disabledRules: ['MISSING_PLACEHOLDER']
  }
}
```

## Performance

- **Latency:** <1ms (synchronous, regex-based)
- **Memory:** Negligible
- **Scalability:** Handles prompts up to 120k characters efficiently

## Limitations

1. **Only detects syntax** - Doesn't validate that variables are actually filled
2. **No validation** - Doesn't check if values are empty strings or null
3. **Template-specific** - Only supports Handlebars, Jinja, Mustache, EJS
4. **No conditional logic** - Doesn't understand `{{#if}}` blocks or conditionals

## Best Practices

### 1. Use Template Dialect Option

If you know the dialect, specify it:

```typescript
{
  prompt: templateString,
  templateDialect: 'handlebars'  // Explicit is better than implicit
}
```

### 2. Validate Before Sending

Use LangPatrol to catch placeholders before API calls:

```typescript
const report = await analyzePrompt({ prompt, templateDialect });
if (report.issues.some(i => i.code === 'MISSING_PLACEHOLDER')) {
  throw new Error('Unresolved placeholders detected');
}
```

### 3. Handle in Development

Add to your development workflow:

```typescript
// In your test suite
test('prompt has no unresolved placeholders', async () => {
  const report = await analyzePrompt({ prompt: myPrompt });
  const placeholderIssues = report.issues.filter(
    i => i.code === 'MISSING_PLACEHOLDER'
  );
  expect(placeholderIssues).toHaveLength(0);
});
```

## Integration Examples

### Pre-flight Validation

```typescript
async function sendToLLM(prompt: string, variables: Record<string, string>) {
  // Fill placeholders
  const filledPrompt = fillPlaceholders(prompt, variables);
  
  // Validate no unresolved placeholders
  const report = await analyzePrompt({
    prompt: filledPrompt,
    templateDialect: 'handlebars'
  });
  
  if (report.issues.some(i => i.code === 'MISSING_PLACEHOLDER')) {
    throw new Error('Unresolved placeholders after filling');
  }
  
  // Safe to send to LLM
  return await callLLM(filledPrompt);
}
```

### CI/CD Integration

```bash
# In your CI script
langpatrol analyze "prompts/**/*.txt" --json --out report.json

# Check for placeholder issues
if jq '.issues[] | select(.code == "MISSING_PLACEHOLDER")' report.json; then
  echo "Unresolved placeholders found!"
  exit 1
fi
```

## Related Rules

- [Missing Reference Detection](./missing-reference.md) - Detects references without antecedents
- [Token Overage Detection](./token-overage.md) - Detects context window violations

## Next Steps

- [API Reference](../api-reference.md) - Complete API documentation
- [Architecture Overview](../architecture.md) - Understand the system design

