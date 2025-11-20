# Conflicting Instruction Detection

## Overview

The Conflicting Instruction Detection system identifies contradictory directives in prompts that ask for mutually exclusive behaviors. These conflicts lead to unpredictable model outputs, inconsistent results, and poor user experience.

The rule supports three detection methods:
1. **Pattern Matching** (default, fast) - Regex-based detection of known conflict patterns
2. **Semantic Similarity** (optional) - Uses BERT embeddings to detect paraphrased conflicts
3. **NLI Entailment** (optional) - Uses Natural Language Inference to detect logical contradictions

## Why This Matters

## Architecture

### Detection Pipeline

### 1. Pattern Detection (Default)

### Detection Methods

#### 1. Pattern Matching (Default)

**Algorithm:**
1. Apply regex patterns to extract conflict keywords
2. Group matches by conflict category (verbosity, format)
3. Check for presence of both sides of conflict pairs
4. Report conflicts with 1.0 confidence

**Pattern Categories:**

**Verbosity Conflicts:**
```typescript
VERBOSE_PATTERNS = /\b(detailed|comprehensive|step by step|exhaustive)\b/i
CONCISE_PATTERNS = /\b(concise|brief|minimal|short)\b/i
```

**Format Conflicts:**
```typescript
JSON_ONLY_PATTERNS = /\b(json\s*only|strict\s*json|return\s*valid\s*json)\b/i
EXPLANATORY_PATTERNS = /\b(explain|commentary|notes|discussion)\b/i
```

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

The system extracts instruction phrases using sentence segmentation:

### Example 1: Pattern-Based Detection

```typescript
const report = await analyzePrompt({
  prompt: 'Be concise and give a detailed step-by-step explanation.'
});
```

### Enable Semantic Similarity Detection

```typescript
const report = await analyzePrompt({
  prompt: 'Keep it brief but provide a comprehensive analysis.',
  options: {
    useSemanticConflictDetection: true,
    conflictSimilarityThreshold: 0.3  // Lower = more conflicts detected
  }
});
```

**Threshold Tuning:**

| Threshold | Behavior | Use Case |
|-----------|----------|----------|
| 0.2-0.3 | More lenient, catches more paraphrased conflicts | High recall, accept some false positives |
| 0.3-0.4 | Balanced (recommended) | General purpose, good precision/recall tradeoff |
| 0.4-0.5 | Stricter, fewer false positives | High precision, may miss subtle conflicts |

**Mathematical Rationale:**
- Lower threshold = more conflicts detected (higher recall)
- Higher threshold = fewer conflicts detected (higher precision)
- Default 0.3 balances the tradeoff for most use cases

### Enable NLI Contradiction Detection

```typescript
const report = await analyzePrompt({
  prompt: 'Output JSON only. Add commentary after the JSON.',
  options: {
    useNLIConflictDetection: true,
    conflictContradictionThreshold: 0.7  // Higher = stricter
  }
});
```

**Threshold Tuning:**

| Threshold | Behavior | Use Case |
|-----------|----------|----------|
| 0.6-0.7 | More lenient, catches more contradictions | High recall for logical conflicts |
| 0.7-0.8 | Balanced (recommended) | General purpose, good precision/recall |
| 0.8-0.9 | Stricter, fewer false positives | High precision, only clear contradictions |

### Combined Detection

For maximum accuracy, enable both methods:

```typescript
const report = await analyzePrompt({
  prompt: 'Be brief but provide an elaborate explanation with comprehensive details.',
  options: {
    useSemanticConflictDetection: true,
    useNLIConflictDetection: true,
    conflictSimilarityThreshold: 0.3,
    conflictContradictionThreshold: 0.7
  }
});
```

**Execution Flow:**
1. Pattern matching runs first (synchronous)
2. Semantic similarity runs in parallel for all phrase pairs
3. NLI contradiction runs in parallel for all phrase pairs
4. Results are deduplicated
5. Highest confidence detection is kept for each conflict

## Performance Characteristics

### Pattern Matching

**Latency:**
- Average: <1ms
- Worst case: O(n) where n = prompt length
- Synchronous execution

**Memory:**
- O(m) where m = number of pattern matches
- Typically <1KB for normal prompts

**Scalability:**
- Handles prompts up to 120k characters efficiently
- Linear time complexity

### Semantic Similarity Detection

**Latency:**
- First call: ~200-500ms (includes model load)
- Subsequent calls: ~50-200ms per conflict pair
- Parallel execution for multiple pairs

**Memory:**
- Model: ~90 MB (MiniLM-L6-v2 quantized)
- Runtime: ~1-2 MB per embedding computation
- Lazy-loaded, cached after first use

**Scalability:**
- O(p × q) comparisons where p, q = number of phrases
- Can be optimized with batching for large prompts

**Benchmarks:**
```
Prompt length: 1,000 chars
Phrase pairs: 10
Time: ~150ms (excluding model load)

Prompt length: 10,000 chars
Phrase pairs: 50
Time: ~800ms (excluding model load)
```

### NLI Contradiction Detection

**Latency:**
- First call: ~300-600ms (includes model load)
- Subsequent calls: ~100-300ms per conflict pair
- Parallel execution for multiple pairs

**Memory:**
- Model: ~250 MB (distilbert-base-uncased-mnli quantized)
- Runtime: ~2-4 MB per inference
- Lazy-loaded, cached after first use

**Scalability:**
- O(n²) comparisons where n = number of instruction phrases
- Quadratic complexity - may be slow for prompts with many instructions

**Benchmarks:**
```
Instruction phrases: 5
Pair comparisons: 10
Time: ~250ms (excluding model load)

Instruction phrases: 20
Pair comparisons: 190
Time: ~2.5s (excluding model load)
```

### Combined Detection

**Latency:**
- Sum of individual method latencies
- Pattern: <1ms
- Semantic: 50-200ms per pair
- NLI: 100-300ms per pair
- Total: ~150-500ms per conflict pair (excluding model loads)

**Memory:**
- ~340 MB (both models)
- Models loaded lazily on first use
- Shared across all conflict checks

**Optimization Strategies:**
1. **Early termination**: Pattern matching can short-circuit if conflicts found
2. **Batching**: Embedding computations can be batched
3. **Caching**: Model pipelines are cached after first load
4. **Deduplication**: Reduces redundant checks

## Model Specifications

### Semantic Similarity Model

**Model:** `Xenova/all-MiniLM-L6-v2`

| Property | Value |
|----------|-------|
| Architecture | MiniLM (6 layers, 384 dimensions) |
| Size | ~90 MB (quantized) |
| Task | Feature extraction (embeddings) |
| Dimensions | 384 |
| Max Sequence Length | 512 tokens |
| Library | `@xenova/transformers` |
| Quantization | INT8 (quantized) |

**Why this model?**
- **Efficiency**: Small footprint, fast inference
- **Quality**: Good semantic understanding for similarity tasks
- **Compatibility**: ONNX format, runs in Node.js via transformers.js

### NLI Model

**Model:** `Xenova/distilbert-base-uncased-mnli`

| Property | Value |
|----------|-------|
| Architecture | DistilBERT (6 layers, 768 dimensions) |
| Size | ~250 MB (quantized) |
| Task | Zero-shot classification (NLI) |
| Labels | Entailment, Contradiction, Neutral |
| Max Sequence Length | 512 tokens |
| Library | `@xenova/transformers` |
| Quantization | INT8 (quantized) |

**Why this model?**
- **NLI-specific**: Trained specifically for Natural Language Inference
- **Logical understanding**: Captures contradiction relationships
- **Efficiency**: Distilled version of BERT, faster than full BERT

## Response Format

Each conflict occurrence includes detailed metadata:

```typescript
interface ConflictOccurrence {
  text: string;                    // The conflicting phrase
  start: number;                   // Character position (0-indexed)
  end: number;                     // Character position (exclusive)
  bucket: 'verbosity' | 'format' | 'semantic' | 'logical';
  method: 'pattern' | 'semantic' | 'nli' | 'combined';
  confidence: number;              // 0-1, higher = more confident
  preview: string;                  // Context snippet (50 chars before/after)
  pairedWith: {                    // The conflicting instruction
    text: string;
    start: number;
    end: number;
    preview: string;
  };
}
```

**Example Response:**

```json
{
  "issues": [{
    "id": "iss_abc123",
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
    },
    "scope": {
      "type": "prompt"
    },
    "confidence": "high"
  }],
  "suggestions": [{
    "type": "TIGHTEN_INSTRUCTION",
    "text": "Remove either the \"concise\" or \"step-by-step\" directive to avoid contradictions.",
    "for": "iss_abc123"
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
    useSemanticConflictDetection: true,
    conflictSimilarityThreshold: 0.3
  }
});

// Post-process to add custom conflict detection
const customConflicts = detectCustomConflicts(myPrompt);
report.issues.push(...customConflicts);
```

### Performance Optimization

For high-throughput scenarios:

```typescript
// 1. Pre-load models (warm-up)
await analyzePrompt({
  prompt: 'warmup',
  options: {
    useSemanticConflictDetection: true,
    useNLIConflictDetection: true
  }
});

// 2. Use pattern matching only for fast path
const fastReport = await analyzePrompt({ prompt });

// 3. Only enable semantic/NLI for suspicious prompts
if (fastReport.issues.some(i => i.code === 'CONFLICTING_INSTRUCTION')) {
  const detailedReport = await analyzePrompt({
    prompt,
    options: {
      useSemanticConflictDetection: true,
      useNLIConflictDetection: true
    }
  });
}
```

### Batch Processing

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

Start with pattern matching, enable semantic/NLI only when needed:

```typescript
// Phase 1: Fast pattern matching
const report = await analyzePrompt({ prompt });

// Phase 2: Enhanced detection if conflicts found
if (report.issues.some(i => i.code === 'CONFLICTING_INSTRUCTION')) {
  const enhancedReport = await analyzePrompt({
    prompt,
    options: {
      useSemanticConflictDetection: true,
      useNLIConflictDetection: true
    }
  });
}
```

### 4. Use in Development

Calibrate thresholds based on your domain:

```typescript
// Development: More lenient (catch everything)
const devConfig = {
  conflictSimilarityThreshold: 0.2,
  conflictContradictionThreshold: 0.6
};

// Production: Balanced
const prodConfig = {
  conflictSimilarityThreshold: 0.3,
  conflictContradictionThreshold: 0.7
};

// Staging: Stricter (fewer false positives)
const stagingConfig = {
  conflictSimilarityThreshold: 0.4,
  conflictContradictionThreshold: 0.8
};
```

### 3. Integration in CI/CD

```typescript
// In your test suite
describe('Prompt Validation', () => {
  it('should detect conflicting instructions', async () => {
    const report = await analyzePrompt({
      prompt: 'Be concise and give detailed explanation.',
      options: {
        useSemanticConflictDetection: true
      }
    });
    
    const conflicts = report.issues.filter(
      i => i.code === 'CONFLICTING_INSTRUCTION'
    );
    
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].confidence).toBeGreaterThan(0.7);
  });
});
```

### 5. Fix Common Patterns

Track conflict detection metrics:

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

## Related Documentation

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

## Technical References

### Papers and Models

- **MiniLM**: [Language Models are Unsupervised Multitask Learners](https://arxiv.org/abs/1909.10351)
- **DistilBERT**: [DistilBERT, a distilled version of BERT](https://arxiv.org/abs/1910.01108)
- **NLI**: [Natural Language Inference](https://nlp.stanford.edu/pubs/snli_paper.pdf)

### Implementation

- **Transformers.js**: [@xenova/transformers](https://github.com/xenova/transformers.js)
- **ONNX Runtime**: Model execution backend
- **Cosine Similarity**: Standard vector similarity metric

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

- [Architecture Overview](../architecture.md) - System design and components
- [Development Guide](../development.md) - Contributing and extending the system
- [API Reference](../api-reference.md) - Complete API documentation
- [Architecture Overview](../architecture.md) - Understand the system design
- [Semantic Analytics](../technical/semantic-analytics.md) - Learn about semantic similarity
- [NLI Entailment](../technical/nli-entailment.md) - Learn about NLI models
