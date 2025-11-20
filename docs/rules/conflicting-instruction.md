# Conflicting Instruction Detection

## Overview

The Conflicting Instruction Detection rule identifies contradictory directives in prompts. These are cases where the prompt asks for mutually exclusive behaviors, like "be concise" and "give a detailed explanation" in the same prompt.

The rule supports three detection methods:
1. **Pattern Matching** (default, fast) - Regex-based detection of known conflict patterns
2. **Semantic Similarity** (optional) - Uses BERT embeddings to detect paraphrased conflicts
3. **NLI Entailment** (optional) - Uses Natural Language Inference to detect logical contradictions

## Why This Matters

Conflicting instructions lead to:
- **Unpredictable outputs** - The model doesn't know which instruction to follow
- **Inconsistent results** - Different runs may emphasize different instructions
- **Poor user experience** - Outputs don't match expectations

## How It Works

### 1. Pattern Detection (Default)

The rule uses regex patterns to detect conflicting instruction categories:

**Verbosity Conflicts:**
- **Verbose patterns:** "step by step", "detailed explanation", "thoroughly", "in depth"
- **Concise patterns:** "be concise", "brief", "short", "summarize"

**Format Conflicts:**
- **JSON-only patterns:** "JSON only", "strict JSON", "no commentary"
- **Explanatory patterns:** "add commentary", "include notes", "explain your reasoning"

### 2. Semantic Similarity Detection (Optional)

When enabled, uses **MiniLM-L6-v2** embeddings to detect semantically opposite instructions that may be paraphrased:

**How it works:**
1. Extracts phrases containing conflict keywords
2. Computes semantic similarity between opposite concepts
3. Low similarity (< threshold) indicates a conflict

**Example:**
```typescript
// These will be detected as conflicts even though they use different words:
"Be brief" vs "Provide a comprehensive analysis"
"Keep it short" vs "Give an elaborate explanation"
```

**Configuration:**
```typescript
{
  options: {
    useSemanticConflictDetection: true,
    conflictSimilarityThreshold: 0.3  // Lower = more conflicts detected (default: 0.3)
  }
}
```

### 3. NLI Contradiction Detection (Optional)

When enabled, uses **distilbert-base-uncased-mnli** to detect logical contradictions:

**How it works:**
1. Extracts instruction phrases from the prompt
2. Uses Natural Language Inference to check if instructions contradict each other
3. High contradiction score (> threshold) indicates a conflict

**Example:**
```typescript
// NLI can detect logical contradictions that pattern matching might miss:
"Output only JSON" vs "Include explanatory notes"
"Be quick" vs "Take your time to be thorough"
```

**Configuration:**
```typescript
{
  options: {
    useNLIConflictDetection: true,
    conflictContradictionThreshold: 0.7  // Higher = stricter (default: 0.7)
  }
}
```

### 4. Combined Detection

You can enable both semantic and NLI detection for maximum accuracy:

```typescript
{
  options: {
    useSemanticConflictDetection: true,
    useNLIConflictDetection: true,
    conflictSimilarityThreshold: 0.3,
    conflictContradictionThreshold: 0.7
  }
}
```

The system will:
1. Run pattern matching (always)
2. Run semantic similarity detection (if enabled)
3. Run NLI contradiction detection (if enabled)
4. Deduplicate conflicts found by multiple methods
5. Keep the highest confidence detection for each conflict

## Examples

### Example 1: Pattern-Based Detection

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
        "bucket": "verbosity",
        "method": "pattern",
        "confidence": 1.0,
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

### Example 2: Semantic Similarity Detection

```typescript
const report = await analyzePrompt({
  prompt: 'Keep it brief but provide a comprehensive analysis.',
  options: {
    useSemanticConflictDetection: true,
    conflictSimilarityThreshold: 0.3
  }
});

// Detects conflict via semantic similarity:
// - "Keep it brief" (low similarity with "comprehensive analysis")
```

**Report:**
```json
{
  "issues": [{
    "code": "CONFLICTING_INSTRUCTION",
    "severity": "medium",
    "detail": "Conflicting directives: semantically conflicting instructions.",
    "evidence": {
      "summary": [
        { "text": "semantic", "count": 1 }
      ],
      "occurrences": [{
        "text": "brief",
        "start": 8,
        "end": 13,
        "bucket": "verbosity",
        "method": "semantic",
        "confidence": 0.85,
        "preview": "...Keep it brief but provide...",
        "pairedWith": {
          "text": "comprehensive analysis",
          "start": 22,
          "end": 44,
          "preview": "...provide a comprehensive analysis."
        }
      }]
    }
  }]
}
```

### Example 3: NLI Contradiction Detection

```typescript
const report = await analyzePrompt({
  prompt: 'Output JSON only. Add commentary after the JSON explaining your reasoning.',
  options: {
    useNLIConflictDetection: true,
    conflictContradictionThreshold: 0.7
  }
});

// Detects conflict via NLI:
// - "JSON only" contradicts "Add commentary"
```

**Report:**
```json
{
  "issues": [{
    "code": "CONFLICTING_INSTRUCTION",
    "severity": "medium",
    "detail": "Conflicting directives: logically contradictory instructions.",
    "evidence": {
      "summary": [
        { "text": "logical", "count": 1 }
      ],
      "occurrences": [{
        "text": "JSON only",
        "start": 7,
        "end": 16,
        "bucket": "format",
        "method": "nli",
        "confidence": 0.82,
        "preview": "Output JSON only. Add commentary...",
        "pairedWith": {
          "text": "Add commentary",
          "start": 18,
          "end": 32,
          "preview": "...JSON only. Add commentary after..."
        }
      }]
    }
  }]
}
```

### Example 4: No Conflict

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
- "elaborate"

### Concise Patterns

- "be concise"
- "brief"
- "short"
- "summarize"
- "keep it short"
- "condense"
- "succinct"
- "terse"

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
- "describe"
- "elaborate"

## Configuration

### Basic Usage (Pattern Matching Only)

```typescript
{
  options: {
    // Pattern matching is always enabled by default
  }
}
```

### Enable Semantic Similarity Detection

```typescript
{
  options: {
    useSemanticConflictDetection: true,
    conflictSimilarityThreshold: 0.3  // Lower = more conflicts detected
  }
}
```

**Threshold Guidelines:**
- **0.2-0.3**: More lenient, catches more paraphrased conflicts
- **0.3-0.4**: Balanced (recommended)
- **0.4-0.5**: Stricter, fewer false positives

### Enable NLI Contradiction Detection

```typescript
{
  options: {
    useNLIConflictDetection: true,
    conflictContradictionThreshold: 0.7  // Higher = stricter
  }
}
```

**Threshold Guidelines:**
- **0.6-0.7**: More lenient, catches more contradictions
- **0.7-0.8**: Balanced (recommended)
- **0.8-0.9**: Stricter, fewer false positives

### Combined Detection

```typescript
{
  options: {
    useSemanticConflictDetection: true,
    useNLIConflictDetection: true,
    conflictSimilarityThreshold: 0.3,
    conflictContradictionThreshold: 0.7
  }
}
```

### Disabling the Rule

```typescript
{
  options: {
    disabledRules: ['CONFLICTING_INSTRUCTION']
  }
}
```

## Performance

### Pattern Matching (Default)
- **Latency:** <1ms (synchronous, regex-based)
- **Memory:** Negligible
- **Scalability:** Handles prompts up to 120k characters efficiently

### Semantic Similarity Detection
- **Latency:** ~50-200ms per conflict pair (async, includes model load on first call)
- **Memory:** ~90 MB (MiniLM-L6-v2 model)
- **Model:** Lazy-loaded on first use, cached for subsequent calls

### NLI Contradiction Detection
- **Latency:** ~100-300ms per conflict pair (async, includes model load on first call)
- **Memory:** ~250 MB (distilbert-base-uncased-mnli model)
- **Model:** Lazy-loaded on first use, cached for subsequent calls

### Combined Detection
- **Latency:** Sum of individual detection methods
- **Memory:** ~340 MB (both models)
- **Optimization:** Conflicts are deduplicated, keeping highest confidence

## Model Requirements

### Semantic Similarity Model
- **Model:** `Xenova/all-MiniLM-L6-v2`
- **Size:** ~90 MB (quantized)
- **Task:** Feature extraction (embeddings)
- **Library:** `@xenova/transformers`

### NLI Model
- **Model:** `Xenova/distilbert-base-uncased-mnli`
- **Size:** ~250 MB (quantized)
- **Task:** Zero-shot classification
- **Library:** `@xenova/transformers`

**Total footprint:** ~340 MB when both features enabled

## Limitations

1. **Pattern-based detection** - Only detects known conflict patterns (can be enhanced with semantic/NLI)
2. **Language-specific** - Patterns and models are English-focused
3. **False positives** - May flag non-conflicting uses (e.g., "be concise in your summary, but detailed in your analysis")
4. **Performance** - Semantic/NLI detection adds latency (50-300ms per conflict pair)
5. **Context length** - Semantic/NLI models may have limitations with very long prompts

## Best Practices

### 1. Start with Pattern Matching

Pattern matching is fast and catches most common conflicts. Only enable semantic/NLI if you need to detect paraphrased or subtle conflicts.

```typescript
// Start here
const report = await analyzePrompt({ prompt });

// If you need more detection, enable semantic/NLI
const reportEnhanced = await analyzePrompt({
  prompt,
  options: {
    useSemanticConflictDetection: true
  }
});
```

### 2. Tune Thresholds

Adjust thresholds based on your use case:

```typescript
// More lenient (catches more conflicts, may have false positives)
{
  conflictSimilarityThreshold: 0.2,
  conflictContradictionThreshold: 0.6
}

// Balanced (recommended)
{
  conflictSimilarityThreshold: 0.3,
  conflictContradictionThreshold: 0.7
}

// Stricter (fewer false positives, may miss some conflicts)
{
  conflictSimilarityThreshold: 0.4,
  conflictContradictionThreshold: 0.8
}
```

### 3. Review Suggestions

The rule provides actionable suggestions:

```typescript
if (report.issues.some(i => i.code === 'CONFLICTING_INSTRUCTION')) {
  const suggestions = report.suggestions?.filter(
    s => s.type === 'TIGHTEN_INSTRUCTION' || s.type === 'ENFORCE_JSON'
  );
  // Apply suggestions to fix conflicts
}
```

### 4. Use in Development

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

### 5. Fix Common Patterns

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
  const report = await analyzePrompt({ 
    prompt,
    options: {
      useSemanticConflictDetection: true,
      useNLIConflictDetection: true
    }
  });
  
  const conflicts = report.issues.filter(
    i => i.code === 'CONFLICTING_INSTRUCTION'
  );
  
  if (conflicts.length > 0) {
    // Log conflicts and suggestions
    console.warn('Conflicting instructions detected:');
    conflicts.forEach(issue => {
      console.warn(`- ${issue.detail}`);
      issue.evidence.occurrences.forEach(occ => {
        console.warn(`  Method: ${occ.method}, Confidence: ${occ.confidence}`);
      });
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

Use the dev UI to test prompts interactively and see conflicts highlighted in real-time with confidence scores and detection methods.

## Response Format

Each conflict occurrence includes:

```typescript
{
  text: string;           // The conflicting phrase
  start: number;          // Character position
  end: number;           // Character position
  bucket: 'verbosity' | 'format' | 'semantic' | 'logical';
  method: 'pattern' | 'semantic' | 'nli' | 'combined';
  confidence: number;    // 0-1, higher = more confident
  preview: string;       // Context snippet
  pairedWith: {          // The conflicting instruction
    text: string;
    start: number;
    end: number;
    preview: string;
  }
}
```

## Related Rules

- [Schema Risk Detection](./schema-risk.md) - Detects JSON/prose conflicts
- [Missing Reference Detection](./missing-reference.md) - Detects references without antecedents

## Technical Details

### Detection Methods Comparison

| Method | Speed | Accuracy | Use Case |
|--------|-------|----------|----------|
| Pattern | Fastest (<1ms) | Good for exact matches | Default, most common conflicts |
| Semantic | Medium (50-200ms) | Good for paraphrases | Paraphrased conflicts |
| NLI | Slower (100-300ms) | Best for logic | Logical contradictions |

### Conflict Deduplication

When multiple methods detect the same conflict:
- All detections are evaluated
- Duplicates are removed based on position
- Highest confidence detection is kept
- Method is recorded for transparency

## Next Steps

- [API Reference](../api-reference.md) - Complete API documentation
- [Architecture Overview](../architecture.md) - Understand the system design
- [Semantic Analytics](../technical/semantic-analytics.md) - Learn about semantic similarity
- [NLI Entailment](../technical/nli-entailment.md) - Learn about NLI models
