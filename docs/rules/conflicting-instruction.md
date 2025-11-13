# Conflicting Instruction Detection

## Overview

The Conflicting Instruction Detection rule identifies contradictory directives in prompts. These are cases where the prompt asks for mutually exclusive behaviors, like "be concise" and "give a detailed explanation" in the same prompt.

## Why This Matters

Conflicting instructions lead to:
- **Unpredictable outputs** - The model doesn't know which instruction to follow
- **Inconsistent results** - Different runs may emphasize different instructions
- **Poor user experience** - Outputs don't match expectations

## How It Works

### 1. Pattern Detection

The rule uses regex patterns to detect conflicting instruction categories:

**Verbosity Conflicts:**
- **Verbose patterns:** "step by step", "detailed explanation", "thoroughly", "in depth"
- **Concise patterns:** "be concise", "brief", "short", "summarize"

**Format Conflicts:**
- **JSON-only patterns:** "JSON only", "strict JSON", "no commentary"
- **Explanatory patterns:** "add commentary", "include notes", "explain your reasoning"

### 2. Conflict Detection

Checks if both sides of a conflict are present:

```typescript
if (verboseMatches.length > 0 && conciseMatches.length > 0) {
  // Verbosity conflict detected
}

if (jsonOnlyMatches.length > 0 && explanatoryMatches.length > 0) {
  // Format conflict detected
}
```

### 3. Issue Reporting

Reports pairs of conflicting instructions with:
- Both conflicting phrases
- Positions in text
- Preview snippets
- Actionable suggestions

## Examples

### Example 1: Verbosity Conflict

```typescript
const report = await analyzePrompt({
  prompt: 'Be concise and give a detailed step-by-step explanation.'
});

// Detects conflict:
// - "Be concise" (concise pattern)
// - "detailed step-by-step explanation" (verbose pattern)
```

**Report:**
```json
{
  "issues": [{
    "code": "CONFLICTING_INSTRUCTION",
    "severity": "medium",
    "detail": "Conflicting directives: concise vs step by step.",
    "evidence": {
      "summary": [
        { "text": "verbosity", "count": 1 }
      ],
      "occurrences": [{
        "text": "Be concise",
        "start": 0,
        "end": 11,
        "preview": "Be concise and give a detailed...",
        "pairedWith": {
          "text": "detailed step-by-step explanation",
          "start": 25,
          "end": 58,
          "preview": "...give a detailed step-by-step explanation."
        }
      }]
    }
  }],
  "suggestions": [{
    "type": "TIGHTEN_INSTRUCTION",
    "text": "Remove either the \"concise\" or \"step-by-step\" directive to avoid contradictions."
  }]
}
```

### Example 2: Format Conflict

```typescript
const report = await analyzePrompt({
  prompt: 'Output JSON only. Add commentary after the JSON explaining your reasoning.',
  schema: {
    type: 'object',
    properties: { name: { type: 'string' } }
  }
});

// Detects conflict:
// - "JSON only" (JSON-only pattern)
// - "Add commentary" (explanatory pattern)
```

**Report:**
```json
{
  "issues": [{
    "code": "CONFLICTING_INSTRUCTION",
    "severity": "medium",
    "detail": "Conflicting directives: JSON only vs commentary.",
    "evidence": {
      "summary": [
        { "text": "format", "count": 1 }
      ],
      "occurrences": [{
        "text": "JSON only",
        "start": 7,
        "end": 16,
        "preview": "Output JSON only. Add commentary...",
        "pairedWith": {
          "text": "Add commentary",
          "start": 18,
          "end": 32,
          "preview": "...JSON only. Add commentary after..."
        }
      }]
    }
  }],
  "suggestions": [{
    "type": "ENFORCE_JSON",
    "text": "If strict JSON is required, drop commentary instructions or move them into schema metadata."
  }]
}
```

### Example 3: No Conflict

```typescript
const report = await analyzePrompt({
  prompt: 'Be concise and brief.'
});

// No conflict - both are concise patterns
// No issue reported
```

## Detected Patterns

### Verbose Patterns

- "step by step"
- "detailed explanation"
- "thoroughly"
- "in depth"
- "comprehensive"
- "extensive"

### Concise Patterns

- "be concise"
- "brief"
- "short"
- "summarize"
- "keep it short"
- "condense"

### JSON-Only Patterns

- "JSON only"
- "strict JSON"
- "no commentary"
- "pure JSON"
- "JSON format only"

### Explanatory Patterns

- "add commentary"
- "include notes"
- "explain your reasoning"
- "provide explanation"
- "add discussion"

## Configuration

### Disabling the Rule

```typescript
{
  options: {
    disabledRules: ['CONFLICTING_INSTRUCTION']
  }
}
```

## Performance

- **Latency:** <1ms (synchronous, regex-based)
- **Memory:** Negligible
- **Scalability:** Handles prompts up to 120k characters efficiently

## Limitations

1. **Pattern-based** - Only detects known conflict patterns
2. **No semantic understanding** - Doesn't understand context or nuance
3. **False positives** - May flag non-conflicting uses (e.g., "be concise in your summary, but detailed in your analysis")
4. **Language-specific** - Patterns are English-focused

## Best Practices

### 1. Review Suggestions

The rule provides actionable suggestions:

```typescript
if (report.issues.some(i => i.code === 'CONFLICTING_INSTRUCTION')) {
  const suggestions = report.suggestions?.filter(
    s => s.type === 'TIGHTEN_INSTRUCTION' || s.type === 'ENFORCE_JSON'
  );
  // Apply suggestions to fix conflicts
}
```

### 2. Use in Development

Add to your development workflow:

```typescript
// In your test suite
test('prompt has no conflicting instructions', async () => {
  const report = await analyzePrompt({ prompt: myPrompt });
  const conflictIssues = report.issues.filter(
    i => i.code === 'CONFLICTING_INSTRUCTION'
  );
  expect(conflictIssues).toHaveLength(0);
});
```

### 3. Fix Common Patterns

**Verbosity conflicts:**
- ❌ "Be concise and give a detailed explanation"
- ✅ "Be concise" OR "Give a detailed explanation"

**Format conflicts:**
- ❌ "Output JSON only. Add commentary."
- ✅ "Output JSON only." OR "Output JSON with commentary in a separate field."

## Integration Examples

### Pre-flight Validation

```typescript
async function validatePrompt(prompt: string) {
  const report = await analyzePrompt({ prompt });
  
  const conflicts = report.issues.filter(
    i => i.code === 'CONFLICTING_INSTRUCTION'
  );
  
  if (conflicts.length > 0) {
    // Log conflicts and suggestions
    console.warn('Conflicting instructions detected:');
    conflicts.forEach(issue => {
      console.warn(`- ${issue.detail}`);
    });
    
    report.suggestions?.forEach(suggestion => {
      console.info(`Suggestion: ${suggestion.text}`);
    });
    
    // Optionally throw or return warnings
    throw new Error('Conflicting instructions in prompt');
  }
}
```

### Interactive Development

Use the dev UI to test prompts interactively and see conflicts highlighted in real-time.

## Related Rules

- [Schema Risk Detection](./schema-risk.md) - Detects JSON/prose conflicts
- [Missing Reference Detection](./missing-reference.md) - Detects references without antecedents

## Next Steps

- [API Reference](../api-reference.md) - Complete API documentation
- [Architecture Overview](../architecture.md) - Understand the system design

