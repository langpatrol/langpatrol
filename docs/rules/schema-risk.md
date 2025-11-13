# Schema Risk Detection

## Overview

The Schema Risk Detection rule identifies prompts that request strict JSON output while also asking for prose commentary or explanations. This creates a conflict because JSON is a structured format that doesn't allow free-form text, while commentary requires prose.

## Why This Matters

When a prompt requests JSON but also asks for commentary:
- **Parsing failures** - The JSON parser fails when it encounters prose
- **Inconsistent outputs** - The model may include prose in JSON (invalid) or omit it
- **Broken integrations** - Downstream code expecting pure JSON breaks

## How It Works

### 1. Schema Requirement

The rule **only runs when a `schema` is provided** in the input. This indicates the prompt is requesting structured output.

### 2. Pattern Detection

Detects two types of patterns:

**JSON Keywords:**
- "JSON", "json"
- "JSON only"
- "strict JSON"
- "pure JSON"

**Prose-After-JSON Patterns:**
- "add commentary"
- "include notes"
- "add explanation"
- "provide discussion"
- "explain your reasoning"

### 3. Conflict Detection

Flags when **both** patterns are present:

```typescript
const jsonCue = hasJsonKeywords(text);
const proseAfterJson = hasProseAfterJsonPattern(text);

if (jsonCue && proseAfterJson) {
  // Conflict detected
}
```

### 4. Issue Reporting

Reports:
- JSON keyword location
- Prose pattern location
- Preview snippets
- Actionable suggestions

## Examples

### Example 1: Basic Conflict

```typescript
const report = await analyzePrompt({
  prompt: 'Output JSON only. Add commentary after the JSON.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' }
    }
  }
});

// Detects conflict:
// - "JSON only" (JSON keyword)
// - "Add commentary" (prose pattern)
```

**Report:**
```json
{
  "issues": [{
    "code": "SCHEMA_RISK",
    "severity": "medium",
    "detail": "Prompt mixes strict JSON instructions with additional prose after the schema.",
    "evidence": {
      "summary": [
        { "text": "json keywords", "count": 1 },
        { "text": "prose after json request", "count": 1 }
      ],
      "occurrences": [
        {
          "text": "JSON only",
          "start": 7,
          "end": 16,
          "preview": "Output JSON only. Add commentary..."
        },
        {
          "text": "Add commentary",
          "start": 18,
          "end": 32,
          "preview": "...JSON only. Add commentary after..."
        }
      ]
    }
  }],
  "suggestions": [{
    "type": "ENFORCE_JSON",
    "text": "Move commentary into structured fields or drop it when requesting strict JSON."
  }]
}
```

### Example 2: No Schema (No Detection)

```typescript
const report = await analyzePrompt({
  prompt: 'Output JSON only. Add commentary.'
  // No schema provided
});

// Rule doesn't run - no schema means no structured output requirement
// No issue reported
```

### Example 3: JSON Without Commentary (No Conflict)

```typescript
const report = await analyzePrompt({
  prompt: 'Output JSON only.',
  schema: {
    type: 'object',
    properties: { name: { type: 'string' } }
  }
});

// No conflict - only JSON keyword, no prose pattern
// No issue reported
```

### Example 4: Commentary Without JSON Keyword (No Conflict)

```typescript
const report = await analyzePrompt({
  prompt: 'Return user data. Add commentary explaining your choices.',
  schema: {
    type: 'object',
    properties: { name: { type: 'string' } }
  }
});

// No conflict - no explicit "JSON only" keyword
// (Though schema implies JSON, rule requires explicit keyword)
```

## Configuration

### Disabling the Rule

```typescript
{
  options: {
    disabledRules: ['SCHEMA_RISK']
  }
}
```

## Performance

- **Latency:** <1ms (synchronous, regex-based)
- **Memory:** Negligible
- **Scalability:** Handles prompts up to 120k characters efficiently

## Limitations

1. **Requires schema** - Only runs when `schema` is provided
2. **Requires explicit JSON keyword** - Doesn't detect implicit JSON requests
3. **Pattern-based** - Only detects known patterns
4. **No semantic understanding** - Doesn't understand context

## Best Practices

### 1. Use Schema Metadata

Instead of asking for commentary in prose, include it in the schema:

```typescript
// ❌ Bad
{
  prompt: 'Output JSON only. Add commentary.',
  schema: { type: 'object', properties: { name: { type: 'string' } } }
}

// ✅ Good
{
  prompt: 'Output JSON only.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      notes: { type: 'string', description: 'Commentary explaining choices' }
    }
  }
}
```

### 2. Separate JSON and Commentary

If you need both, structure them separately:

```typescript
// ✅ Good
{
  prompt: 'Output JSON in the "data" field and commentary in the "notes" field.',
  schema: {
    type: 'object',
    properties: {
      data: { type: 'object' },
      notes: { type: 'string' }
    }
  }
}
```

### 3. Use Suggestions

The rule provides actionable suggestions:

```typescript
if (report.issues.some(i => i.code === 'SCHEMA_RISK')) {
  const suggestions = report.suggestions?.filter(
    s => s.type === 'ENFORCE_JSON'
  );
  // Apply suggestions to fix conflicts
}
```

## Integration Examples

### Pre-flight Validation

```typescript
async function validateStructuredPrompt(prompt: string, schema: JSONSchema7) {
  const report = await analyzePrompt({ prompt, schema });
  
  const schemaRisks = report.issues.filter(
    i => i.code === 'SCHEMA_RISK'
  );
  
  if (schemaRisks.length > 0) {
    console.warn('Schema risk detected:');
    schemaRisks.forEach(issue => {
      console.warn(`- ${issue.detail}`);
    });
    
    // Optionally throw or return warnings
    throw new Error('Schema risk in prompt');
  }
}
```

### Development Testing

```typescript
// In your test suite
test('structured prompts have no schema risks', async () => {
  const report = await analyzePrompt({
    prompt: myPrompt,
    schema: mySchema
  });
  
  const schemaRisks = report.issues.filter(
    i => i.code === 'SCHEMA_RISK'
  );
  
  expect(schemaRisks).toHaveLength(0);
});
```

## Related Rules

- [Conflicting Instruction Detection](./conflicting-instruction.md) - Detects contradictory directives
- [Token Overage Detection](./token-overage.md) - Detects context window violations

## Next Steps

- [API Reference](../api-reference.md) - Complete API documentation
- [Architecture Overview](../architecture.md) - Understand the system design

