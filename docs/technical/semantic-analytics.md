# Semantic Analytics

## Overview

Semantic analytics in LangPatrol uses embedding-based similarity to detect when references are fulfilled by semantically similar text, even when exact word matches aren't present. This enables the system to catch paraphrases and related concepts that pattern matching alone would miss.

## Why Semantic Analytics?

### The Problem with Pattern Matching

Traditional pattern matching works well for exact matches:
- "the report" → finds "report" or "reports" ✅
- "the report" → finds "document" (via synonym) ✅

But it fails for paraphrases:
- "the report" → doesn't find "sales document" ❌
- "the report" → doesn't find "quarterly analysis" ❌
- "the file" → doesn't find "uploaded document" ❌

### The Solution: Embeddings

Semantic similarity uses **text embeddings** - dense vector representations of text that capture semantic meaning. Similar concepts map to nearby vectors in embedding space, allowing us to detect paraphrases and related terms.

## How It Works

### 1. Model: MiniLM-L6-v2

LangPatrol uses **Xenova/all-MiniLM-L6-v2**, a lightweight, quantized embedding model:

- **Size:** ~90 MB (quantized)
- **Dimensions:** 384
- **Task:** Feature extraction (embeddings)
- **Library:** `@xenova/transformers`

**Why this model?**
- Small footprint (fits in memory)
- Fast inference (~50-200ms)
- Good quality for similarity tasks
- Quantized for efficiency

### 2. Embedding Process

```typescript
// 1. Load model (lazy-loaded, cached)
const pipeline = await getEmbeddingPipeline();

// 2. Compute embeddings for both texts
const [embedding1, embedding2] = await Promise.all([
  pipeline(text1, { pooling: 'mean', normalize: true }),
  pipeline(text2, { pooling: 'mean', normalize: true }),
]);

// 3. Extract vectors
const vec1 = Array.from(embedding1.data);
const vec2 = Array.from(embedding2.data);

// 4. Compute cosine similarity
const similarity = cosineSimilarity(vec1, vec2);
```

### 3. Cosine Similarity

After computing embeddings, we calculate **cosine similarity** between the vectors:

```
similarity = (vec1 · vec2) / (||vec1|| × ||vec2||)
```

For normalized embeddings (which we use), cosine similarity ranges from -1 to 1, but in practice it's typically 0 to 1 for similar texts.

**Interpretation:**
- `0.9-1.0` - Very similar (near synonyms)
- `0.7-0.9` - Similar (related concepts)
- `0.5-0.7` - Somewhat related
- `0.0-0.5` - Unrelated

### 4. Threshold-Based Matching

A reference is considered "fulfilled" if similarity exceeds the threshold:

```typescript
if (similarity >= similarityThreshold) {  // default: 0.6
  return { status: 'fulfilled', method: 'semantic-similarity' };
}
```

## Usage in LangPatrol

### When It's Used

Semantic similarity is used in the **Missing Reference Detection** rule when:

1. `useSemanticSimilarity: true` is set, OR
2. `similarityThreshold` is provided (auto-enables semantic similarity)

### Integration with Fulfillment Checking

Semantic similarity is part of a hierarchical fulfillment checking pipeline:

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
    useSemanticSimilarity: true,
    similarityThreshold: 0.6
  }
});

// "the report" matches "sales document" via semantic similarity
// Similarity score: ~0.72 (above threshold)
// Result: Reference is fulfilled, no issue reported
```

## Advanced Features

### Chunked Matching

For long contexts (>1000 chars), semantic similarity can use **chunked matching**:

```typescript
{
  options: {
    useChunkedMatching: true,
    chunkSize: 500,
    chunkOverlap: 100
  }
}
```

**How it works:**
1. Split search text into overlapping chunks
2. Compute similarity for each chunk
3. Return maximum similarity

**Why it's useful:**
- Long contexts can dilute similarity scores
- Chunking focuses on local relevance
- Overlap prevents missing matches at boundaries

### Sentence-Level Matching

Compare reference against individual sentences:

```typescript
{
  options: {
    useSentenceLevel: true
  }
}
```

**How it works:**
1. Split search text into sentences
2. Compute similarity for each sentence
3. Return maximum similarity

**Why it's useful:**
- More precise than full-text comparison
- Catches references to specific sentences
- Better for structured documents

### Phrase-Level Matching

Extract and compare key phrases:

```typescript
{
  options: {
    usePhraseLevel: true
  }
}
```

**How it works:**
1. Extract noun phrases from both texts
2. Compute similarity for phrase pairs
3. Return maximum similarity

**Why it's useful:**
- Most precise matching
- Focuses on key terms
- Best for short, specific references

## Performance

### Latency

- **First call:** 200-500ms (includes model load)
- **Subsequent calls:** 50-200ms (model cached)
- **Chunked matching:** 100-400ms (depends on chunk count)
- **Sentence-level:** 100-300ms (depends on sentence count)

### Memory

- **Model size:** ~90 MB (quantized)
- **Runtime memory:** ~100-150 MB (model + embeddings)
- **Caching:** Model is cached after first load

### Optimization Tips

1. **Lazy loading** - Model only loads when semantic features are enabled
2. **Caching** - Model is cached after first use
3. **Parallel processing** - Multiple embeddings computed in parallel
4. **Early exit** - Stops at first fulfillment in hierarchical mode

## Configuration

### Basic Configuration

```typescript
{
  options: {
    useSemanticSimilarity: true,
    similarityThreshold: 0.6  // default: 0.6
  }
}
```

### Advanced Configuration

```typescript
{
  options: {
    useSemanticSimilarity: true,
    similarityThreshold: 0.6,
    
    // Context-aware matching
    useChunkedMatching: true,      // Auto-enabled for texts > 1000 chars
    chunkSize: 500,
    chunkOverlap: 100,
    useSentenceLevel: false,
    usePhraseLevel: false,
    
    // Combined scoring
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.4,
      semantic: 0.3,  // Weight for semantic similarity
      nli: 0.3
    }
  }
}
```

## Tuning Thresholds

### Lower Threshold (0.5)
- **More lenient** - Catches more paraphrases
- **More false positives** - May match unrelated texts
- **Use when:** You want to be conservative about missing references

### Default Threshold (0.6)
- **Balanced** - Good precision/recall tradeoff
- **Recommended** - Works well for most cases

### Higher Threshold (0.7)
- **More strict** - Fewer false positives
- **More false negatives** - May miss some paraphrases
- **Use when:** You want high precision, fewer false matches

## Limitations

1. **Language** - Model is English-focused (though multilingual models exist)
2. **Domain** - General-purpose model may miss domain-specific terms
3. **Context** - Doesn't understand conversation flow (use NLI for that)
4. **Speed** - Slower than pattern matching (async, 50-200ms)

## Alternatives

If semantic similarity doesn't meet your needs:

1. **Pattern matching only** - Fastest, exact matches
2. **NLI entailment** - Better for logical relationships
3. **Combined scoring** - Best of all worlds (but slower)
4. **Custom models** - Use domain-specific embedding models

## Custom Models

You can use custom embedding models. See [Model Integration](./model-integration.md) for details.

## Next Steps

- [NLI Entailment](./nli-entailment.md) - Learn about NLI-based validation
- [Fulfillment Checking](./fulfillment-checking.md) - See how semantic similarity fits into the pipeline
- [Missing Reference Detection](../rules/missing-reference.md) - Understand the full reference detection system

