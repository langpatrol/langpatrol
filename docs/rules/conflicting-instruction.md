# Conflicting Instruction Detection

## Overview

The Conflicting Instruction Detection system identifies contradictory directives in prompts that ask for mutually exclusive behaviors. These conflicts lead to unpredictable model outputs, inconsistent results, and poor user experience.

The system implements a **multi-method detection pipeline** that combines:
- **Pattern Matching**: Fast regex-based detection of known conflict patterns (synchronous, <1ms)
- **Semantic Similarity**: BERT-based embedding analysis for paraphrased conflicts (async, 50-200ms)
- **NLI Entailment**: Natural Language Inference for logical contradiction detection (async, 100-300ms)

## Architecture

### Detection Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Input: Prompt Text                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   Pattern Matching Phase     │
        │   (Always Executed)          │
        │   - Regex pattern matching   │
        │   - Conflict pair detection  │
        │   - Fast synchronous check   │
        └──────────────┬───────────────┘
                       │
        ┌──────────────┴───────────────┐
        │                              │
        ▼                              ▼
┌───────────────┐            ┌──────────────────┐
│   Semantic    │            │   NLI Entailment │
│  Similarity   │            │    Detection     │
│  (Optional)   │            │   (Optional)     │
│               │            │                  │
│ - Extract     │            │ - Extract        │
│   phrases     │            │   instruction   │
│ - Compute     │            │   pairs          │
│   embeddings  │            │ - Run NLI        │
│ - Compare     │            │   inference      │
│   opposites   │            │ - Check          │
│ - Threshold   │            │   contradiction  │
│   check       │            │   score          │
└───────┬───────┘            └────────┬─────────┘
        │                             │
        └──────────────┬──────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   Conflict Deduplication      │
        │   - Remove duplicates         │
        │   - Keep highest confidence    │
        │   - Record detection method    │
        └──────────────┬────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   Issue Reporting            │
        │   - Generate evidence        │
        │   - Calculate confidence     │
        │   - Create suggestions       │
        └──────────────────────────────┘
```

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

**Time Complexity:** O(n) where n = prompt length
**Space Complexity:** O(m) where m = number of matches

#### 2. Semantic Similarity Detection

**Algorithm:**
1. Extract phrases containing conflict keywords using sentence segmentation
2. For each opposite pair (concise/verbose, strict/flexible):
   - Compute embeddings for both phrases using MiniLM-L6-v2
   - Calculate cosine similarity: `similarity = (vec1 · vec2) / (||vec1|| × ||vec2||)`
   - If similarity < threshold → conflict detected
   - Confidence = 1 - similarity (lower similarity = higher conflict confidence)

**Mathematical Model:**

Given two instruction phrases `I₁` and `I₂`:
- Embedding vectors: `E₁ = embed(I₁)`, `E₂ = embed(I₂)`
- Cosine similarity: `sim(I₁, I₂) = cos(θ) = (E₁ · E₂) / (||E₁|| × ||E₂||)`
- Conflict score: `conflict(I₁, I₂) = 1 - sim(I₁, I₂)`
- Detection: `conflict(I₁, I₂) > (1 - threshold)`

**Opposite Concept Pairs:**

```typescript
VERBOSITY_OPPOSITES = [
  {
    concise: ['concise', 'brief', 'short', 'minimal', 'succinct', 'terse', 'compact'],
    verbose: ['detailed', 'comprehensive', 'step by step', 'exhaustive', 'thorough', 'elaborate', 'extensive']
  },
  {
    concise: ['quick', 'fast', 'rapid'],
    verbose: ['slow', 'careful', 'methodical']
  }
]

FORMAT_OPPOSITES = [
  {
    strict: ['json only', 'strict json', 'valid json', 'json format', 'no text'],
    flexible: ['explain', 'commentary', 'notes', 'discussion', 'describe', 'elaborate', 'add context']
  }
]
```

**Time Complexity:** O(p × q × e) where:
- p = number of concise phrases
- q = number of verbose phrases  
- e = embedding computation time (~50-200ms per pair)

**Space Complexity:** O(p + q + d) where d = embedding dimensions (384)

#### 3. NLI Contradiction Detection

**Algorithm:**
1. Extract all instruction phrases from prompt
2. For each pair of phrases (I₁, I₂):
   - Construct hypothesis: `"This contradicts: I₂"`
   - Use premise: `I₁`
   - Run zero-shot classification with distilbert-base-uncased-mnli
   - Check both directions: (I₁ → contradicts I₂) and (I₂ → contradicts I₁)
   - Take maximum contradiction score
   - If score > threshold → conflict detected

**Mathematical Model:**

Given instruction phrases `I₁` and `I₂`:
- Premise: `P = I₁`
- Hypothesis: `H = "This contradicts: I₂"`
- NLI score: `score = NLI(P, H)`
- Bidirectional check: `contradiction(I₁, I₂) = max(NLI(I₁, "contradicts I₂"), NLI(I₂, "contradicts I₁"))`
- Detection: `contradiction(I₁, I₂) > threshold`

**Time Complexity:** O(n² × nli) where:
- n = number of instruction phrases
- nli = NLI inference time (~100-300ms per pair)

**Space Complexity:** O(n²) for phrase pairs

### Conflict Deduplication

When multiple detection methods identify the same conflict, the system:

1. **Position-based grouping**: Conflicts are grouped by character positions
   - Key: `bucket:min(start₁, start₂):max(end₁, end₂)`
   
2. **Confidence-based selection**: Among duplicates, keep the detection with highest confidence
   ```typescript
   if (existing.confidence < new.confidence) {
     replace(existing, new);
   }
   ```

3. **Method tracking**: Record which method(s) detected each conflict for transparency

**Deduplication Algorithm:**
```typescript
function deduplicateConflicts(conflicts: ConflictPair[]): ConflictPair[] {
  const seen = new Map<string, ConflictPair>();
  
  for (const conflict of conflicts) {
    const key = `${conflict.bucket}:${Math.min(conflict.a.start, conflict.b.start)}:${Math.max(conflict.a.end, conflict.b.end)}`;
    
    if (!seen.has(key) || seen.get(key).confidence < conflict.confidence) {
      seen.set(key, conflict);
    }
  }
  
  return Array.from(seen.values());
}
```

## Implementation Details

### Phrase Extraction

The system extracts instruction phrases using sentence segmentation:

```typescript
function extractConflictPhrases(text: string, keywords: string[]): ConflictMatch[] {
  const sentences = text.split(/[.!?]\s+/);
  const results: ConflictMatch[] = [];
  
  for (const sentence of sentences) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
      const match = regex.exec(sentence);
      if (match) {
        const sentenceStart = text.indexOf(sentence);
        results.push({
          text: match[0],
          start: sentenceStart + match.index,
          end: sentenceStart + match.index + match[0].length,
          context: sentence.trim() // Full sentence for better semantic analysis
        });
      }
    }
  }
  
  return results;
}
```

### Semantic Conflict Detection

```typescript
async function checkSemanticConflict(
  text1: string,
  text2: string,
  threshold: number = 0.3
): Promise<{ isConflict: boolean; similarity: number }> {
  // Compute embeddings
  const pipeline = await getEmbeddingPipeline();
  const [embedding1, embedding2] = await Promise.all([
    pipeline(text1, { pooling: 'mean', normalize: true }),
    pipeline(text2, { pooling: 'mean', normalize: true })
  ]);
  
  // Extract vectors
  const vec1 = Array.from(embedding1.data);
  const vec2 = Array.from(embedding2.data);
  
  // Calculate cosine similarity
  const similarity = cosineSimilarity(vec1, vec2);
  
  // Low similarity indicates conflict
  const isConflict = similarity < threshold;
  
  return { isConflict, similarity };
}
```

### NLI Contradiction Detection

```typescript
async function checkLogicalContradiction(
  instruction1: string,
  instruction2: string,
  threshold: number = 0.7
): Promise<{ isContradiction: boolean; score: number }> {
  const pipeline = await getNLIPipeline();
  
  // Check both directions
  const [score1, score2] = await Promise.all([
    pipeline(instruction1, [`This contradicts: ${instruction2}`]),
    pipeline(instruction2, [`This contradicts: ${instruction1}`])
  ]);
  
  // Take maximum contradiction score
  const maxScore = Math.max(score1.scores[0], score2.scores[0]);
  const isContradiction = maxScore > threshold;
  
  return { isContradiction, score: maxScore };
}
```

## Configuration

### Basic Usage (Pattern Matching)

Pattern matching is always enabled by default and requires no configuration:

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
        "method": "semantic",
        "confidence": 0.85,
        "preview": "Be concise and give a detailed step-by-step explanation.",
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

## Advanced Usage

### Custom Conflict Patterns

While the system includes predefined patterns, you can extend detection by combining with custom validation:

```typescript
const report = await analyzePrompt({
  prompt: myPrompt,
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

For analyzing multiple prompts:

```typescript
async function analyzeBatch(prompts: string[]) {
  // Pre-load models
  await analyzePrompt({
    prompt: prompts[0],
    options: {
      useSemanticConflictDetection: true,
      useNLIConflictDetection: true
    }
  });
  
  // Process in parallel (models are cached)
  const reports = await Promise.all(
    prompts.map(prompt => analyzePrompt({ prompt }))
  );
  
  return reports;
}
```

## Limitations and Edge Cases

### Known Limitations

1. **Language-specific**: Patterns and models are English-focused
   - **Impact**: May miss conflicts in other languages
   - **Workaround**: Use semantic/NLI detection which has better cross-language support

2. **Context-dependent conflicts**: Some conflicts are valid in context
   - Example: "Be concise in your summary, but detailed in your analysis"
   - **Impact**: May flag false positives
   - **Mitigation**: Review suggestions and adjust thresholds

3. **Performance**: NLI detection has O(n²) complexity
   - **Impact**: Slow for prompts with many instructions
   - **Mitigation**: Use pattern matching + semantic similarity for faster detection

4. **Model limitations**: Embedding models may not capture domain-specific nuances
   - **Impact**: May miss domain-specific conflicts
   - **Workaround**: Extend with custom validation logic

### Edge Cases

**Case 1: Nested Instructions**
```
"Be concise (but detailed in the analysis section)"
```
- Pattern matching: May detect conflict
- Semantic/NLI: Better context understanding, may not flag

**Case 2: Conditional Instructions**
```
"If the data is small, be concise. If large, be detailed."
```
- Pattern matching: Will detect conflict
- Semantic/NLI: May detect conflict (context-dependent)
- **Recommendation**: Review manually, may be valid

**Case 3: Temporal Separation**
```
"First, be concise. Then, provide detailed analysis."
```
- Pattern matching: Will detect conflict
- Semantic/NLI: May detect conflict
- **Recommendation**: Consider temporal context in post-processing

## Best Practices

### 1. Progressive Enhancement

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

### 2. Threshold Calibration

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

### 4. Monitoring and Analytics

Track conflict detection metrics:

```typescript
async function analyzeWithMetrics(prompt: string) {
  const start = performance.now();
  const report = await analyzePrompt({
    prompt,
    options: {
      useSemanticConflictDetection: true,
      useNLIConflictDetection: true
    }
  });
  const latency = performance.now() - start;
  
  const conflicts = report.issues.filter(
    i => i.code === 'CONFLICTING_INSTRUCTION'
  );
  
  // Log metrics
  console.log({
    latency,
    conflictCount: conflicts.length,
    methods: conflicts.flatMap(c => 
      c.evidence.occurrences.map(o => o.method)
    ),
    avgConfidence: conflicts.reduce((sum, c) => 
      sum + c.evidence.occurrences.reduce((s, o) => s + o.confidence, 0) / c.evidence.occurrences.length, 0
    ) / conflicts.length
  });
  
  return report;
}
```

## Related Documentation

- [Semantic Analytics](../technical/semantic-analytics.md) - Deep dive into embedding-based similarity
- [NLI Entailment](../technical/nli-entailment.md) - Natural Language Inference explained
- [Model Integration](../technical/model-integration.md) - Using custom models
- [Missing Reference Detection](./missing-reference.md) - Similar multi-method detection system
- [API Reference](../api-reference.md) - Complete API documentation

## Technical References

### Papers and Models

- **MiniLM**: [Language Models are Unsupervised Multitask Learners](https://arxiv.org/abs/1909.10351)
- **DistilBERT**: [DistilBERT, a distilled version of BERT](https://arxiv.org/abs/1910.01108)
- **NLI**: [Natural Language Inference](https://nlp.stanford.edu/pubs/snli_paper.pdf)

### Implementation

- **Transformers.js**: [@xenova/transformers](https://github.com/xenova/transformers.js)
- **ONNX Runtime**: Model execution backend
- **Cosine Similarity**: Standard vector similarity metric

## Next Steps

- [Architecture Overview](../architecture.md) - System design and components
- [Development Guide](../development.md) - Contributing and extending the system
- [API Reference](../api-reference.md) - Complete API documentation
