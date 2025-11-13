# NLI Entailment

## Overview

Natural Language Inference (NLI) entailment is a technique that validates logical relationships between texts. In LangPatrol, it's used to check if conversation history or context "entails" (logically supports) a reference, providing more precise validation than semantic similarity alone.

## Why NLI Entailment?

### The Problem with Semantic Similarity

Semantic similarity measures how similar two texts are, but it doesn't understand logical relationships:

- "I have a sales document" and "the report" → High similarity ✅
- "I have a sales document" and "there is a report" → High similarity ✅
- "I don't have a sales document" and "the report" → Still high similarity ❌ (but logically wrong!)

### The Solution: NLI

NLI (Natural Language Inference) models understand **entailment** - whether one statement logically follows from another:

- **Entailment:** "I have a sales document" → "There is a report" ✅
- **Contradiction:** "I don't have a sales document" → "There is a report" ❌
- **Neutral:** "I like pizza" → "There is a report" ❌

## How It Works

### 1. Model: distilbert-base-uncased-mnli

LangPatrol uses **Xenova/distilbert-base-uncased-mnli**, a lightweight NLI model:

- **Size:** ~250 MB (quantized)
- **Task:** Zero-shot classification (NLI)
- **Library:** `@xenova/transformers`

**Why this model?**
- Trained specifically for NLI tasks
- Understands logical relationships
- Quantized for efficiency
- Good balance of size and quality

### 2. Entailment Process

```typescript
// 1. Load model (lazy-loaded, cached)
const pipeline = await getNLIPipeline();

// 2. Construct premise and hypothesis
const premise = "I have a sales document with Q3 data.";  // What we have
const hypothesis = "There is the report.";                 // What we're looking for

// 3. Run zero-shot classification
const result = await pipeline(premise, [hypothesis]);

// 4. Extract entailment score
const entailmentScore = result.scores[0];  // Score for the hypothesis
```

### 3. Hypothesis Construction

For reference fulfillment, we construct hypotheses like:

- "the report" → "There is the report"
- "this file" → "There is this file"
- "the list" → "There is the list"

The premise is the conversation history or context we're searching in.

### 4. Score Interpretation

The model returns a score indicating how well the premise entails the hypothesis:

- **0.7-1.0** - Strong entailment (reference is fulfilled)
- **0.5-0.7** - Weak entailment (maybe fulfilled)
- **0.0-0.5** - No entailment (reference not fulfilled)

### 5. Threshold-Based Matching

A reference is considered "fulfilled" if entailment score exceeds the threshold:

```typescript
if (entailmentScore >= entailmentThreshold) {  // default: 0.7
  return { status: 'fulfilled', method: 'nli-entailment' };
}
```

## Usage in LangPatrol

### When It's Used

NLI entailment is used in the **Missing Reference Detection** rule when:

1. `useNLIEntailment: true` is set, OR
2. `similarityThreshold` is provided (auto-enables NLI)

### Integration with Fulfillment Checking

NLI entailment is part of a hierarchical fulfillment checking pipeline:

```
1. Pattern Matching (sync, fast)
   ↓ (if not fulfilled)
2. Semantic Similarity (async, if enabled)
   ↓ (if not fulfilled)
3. NLI Entailment (async, if enabled)
   ↓ (if not fulfilled)
4. Unfulfilled
```

Or in combined mode, all three run in parallel and scores are combined.

### Example

```typescript
const report = await analyzePrompt({
  messages: [
    { role: 'user', content: 'I have a sales document with Q3 data.' },
    { role: 'user', content: 'Summarize the report.' }
  ],
  model: 'gpt-4o',
  options: {
    useNLIEntailment: true,
    entailmentThreshold: 0.7
  }
});

// Premise: "I have a sales document with Q3 data."
// Hypothesis: "There is the report"
// Entailment score: ~0.75 (above threshold)
// Result: Reference is fulfilled, no issue reported
```

## Advanced Features

### Multi-Hypothesis NLI

Generate multiple hypotheses for better matching:

```typescript
{
  options: {
    useMultiHypothesis: true  // default: true
  }
}
```

**How it works:**
1. Generate multiple hypothesis variations:
   - "There is the report"
   - "The report exists"
   - "There is a report"
2. Run NLI for each hypothesis
3. Return maximum score

**Why it's useful:**
- More robust matching
- Handles different phrasings
- Better coverage

### Context-Aware Matching

NLI can be combined with chunked or sentence-level matching:

```typescript
{
  options: {
    useNLIEntailment: true,
    useChunkedMatching: true,
    chunkSize: 500
  }
}
```

**How it works:**
1. Split context into chunks
2. Run NLI for each chunk
3. Return maximum entailment score

**Why it's useful:**
- Long contexts can dilute entailment
- Chunking focuses on local relevance
- Better for structured documents

## Performance

### Latency

- **First call:** 300-600ms (includes model load)
- **Subsequent calls:** 100-300ms (model cached)
- **Multi-hypothesis:** 200-500ms (depends on hypothesis count)
- **Chunked matching:** 200-600ms (depends on chunk count)

### Memory

- **Model size:** ~250 MB (quantized)
- **Runtime memory:** ~300-400 MB (model + activations)
- **Caching:** Model is cached after first load

### Optimization Tips

1. **Lazy loading** - Model only loads when NLI features are enabled
2. **Caching** - Model is cached after first use
3. **Early exit** - Stops at first fulfillment in hierarchical mode
4. **Batch processing** - Multiple hypotheses processed together

## Configuration

### Basic Configuration

```typescript
{
  options: {
    useNLIEntailment: true,
    entailmentThreshold: 0.7  // default: 0.7
  }
}
```

### Advanced Configuration

```typescript
{
  options: {
    useNLIEntailment: true,
    entailmentThreshold: 0.7,
    
    // Multi-hypothesis
    useMultiHypothesis: true,
    
    // Context-aware matching
    useChunkedMatching: true,
    chunkSize: 500,
    chunkOverlap: 100,
    
    // Combined scoring
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.4,
      semantic: 0.3,
      nli: 0.3  // Weight for NLI entailment
    }
  }
}
```

## Tuning Thresholds

### Lower Threshold (0.6)
- **More lenient** - Catches more references
- **More false positives** - May match weak relationships
- **Use when:** You want to be conservative about missing references

### Default Threshold (0.7)
- **Balanced** - Good precision/recall tradeoff
- **Recommended** - Works well for most cases

### Higher Threshold (0.8)
- **More strict** - Fewer false positives
- **More false negatives** - May miss some valid references
- **Use when:** You want high precision, fewer false matches

## Comparison with Semantic Similarity

| Aspect | Semantic Similarity | NLI Entailment |
|--------|-------------------|----------------|
| **Purpose** | Measures text similarity | Validates logical relationships |
| **Speed** | 50-200ms | 100-300ms |
| **Model Size** | ~90 MB | ~250 MB |
| **Best For** | Paraphrases, synonyms | Logical validation, context understanding |
| **Example** | "report" ≈ "document" | "I have a document" → "There is a report" |

**When to use which:**
- **Semantic similarity** - Fast, good for paraphrases
- **NLI entailment** - Slower, better for logical validation
- **Both** - Best accuracy (use combined scoring)

## Limitations

1. **Language** - Model is English-focused
2. **Context length** - Performance degrades with very long contexts
3. **Speed** - Slower than pattern matching or semantic similarity
4. **Domain** - General-purpose model may miss domain-specific logic

## Alternatives

If NLI entailment doesn't meet your needs:

1. **Pattern matching only** - Fastest, exact matches
2. **Semantic similarity** - Faster, good for paraphrases
3. **Combined scoring** - Best of all worlds (but slower)
4. **Custom models** - Use domain-specific NLI models

## Custom Models

You can use custom NLI models. See [Model Integration](./model-integration.md) for details.

## Next Steps

- [Semantic Analytics](./semantic-analytics.md) - Learn about embedding-based similarity
- [Fulfillment Checking](./fulfillment-checking.md) - See how NLI fits into the pipeline
- [Missing Reference Detection](../rules/missing-reference.md) - Understand the full reference detection system

