# Fulfillment Checking

## Overview

Fulfillment checking is the process of determining whether a reference (like "the report" or "this file") has a valid antecedent in the conversation history or context. LangPatrol uses a sophisticated multi-stage pipeline that combines pattern matching, semantic similarity, and NLI entailment to achieve high accuracy.

## Why Multiple Methods?

Each detection method has strengths and weaknesses:

- **Pattern Matching** - Fast, exact matches, but misses paraphrases
- **Semantic Similarity** - Catches paraphrases, but doesn't understand logic
- **NLI Entailment** - Validates logical relationships, but slower

By combining them, we get the best of all worlds: speed, coverage, and precision.

## Two Approaches

### 1. Hierarchical Approach (Default)

Runs methods sequentially, stopping at the first match:

```
Pattern Matching (sync, <1ms)
  ↓ (if not fulfilled)
Semantic Similarity (async, 50-200ms)
  ↓ (if not fulfilled)
NLI Entailment (async, 100-300ms)
  ↓ (if not fulfilled)
Unfulfilled
```

**Advantages:**
- Fast (stops at first match)
- Efficient (doesn't run unnecessary checks)
- Good for most cases

**When to use:**
- Default behavior
- When speed is important
- When pattern matching is sufficient

### 2. Combined Scoring Approach (Optional)

Runs all methods in parallel and combines scores:

```
Pattern Matching ──┐
                   ├─► Weighted Average ──► Combined Score
Semantic Similarity ─┤
                   │
NLI Entailment ─────┘
```

**Advantages:**
- Maximum accuracy
- Balances multiple signals
- Better for ambiguous cases

**When to use:**
- When accuracy is critical
- When dealing with ambiguous references
- When you want fine-grained control

## Implementation

### Hierarchical Fulfillment Checking

```typescript
async function checkFulfillment(
  reference: string,
  searchText: string,
  effectiveNouns: Set<string>,
  effectiveSynonyms: Record<string, Set<string>>,
  options?: {
    similarityThreshold?: number;
    entailmentThreshold?: number;
    useSemanticSimilarity?: boolean;
    useNLIEntailment?: boolean;
    usePatternMatching?: boolean;
  }
): Promise<FulfillmentResult> {
  
  // Step 1: Pattern matching (synchronous, fast)
  if (usePatternMatching) {
    const patternResult = checkPatternMatch(reference, searchText, effectiveNouns, effectiveSynonyms);
    if (patternResult.status === 'fulfilled') {
      return patternResult;  // Early exit
    }
  }

  // Step 2: Semantic similarity (async, if enabled)
  if (useSemanticSimilarity && isSemanticSimilarityAvailable()) {
    const similarity = await computeSemanticSimilarity(reference, searchText);
    if (similarity >= similarityThreshold) {
      return {
        status: 'fulfilled',
        method: 'semantic-similarity',
        confidence: similarity
      };
    }
  }

  // Step 3: NLI entailment (async, if enabled)
  if (useNLIEntailment && isNLIEntailmentAvailable()) {
    const premise = searchText;
    const hypothesis = `There is ${reference}`;
    const entailmentScore = await checkEntailment(premise, hypothesis);
    if (entailmentScore >= entailmentThreshold) {
      return {
        status: 'fulfilled',
        method: 'nli-entailment',
        confidence: entailmentScore
      };
    }
  }

  // No fulfillment found
  return {
    status: 'unfulfilled',
    method: 'none',
    confidence: 0.0
  };
}
```

### Combined Scoring Fulfillment Checking

```typescript
async function checkFulfillmentCombined(
  reference: string,
  searchText: string,
  effectiveNouns: Set<string>,
  effectiveSynonyms: Record<string, Set<string>>,
  options?: {
    combineWeights?: {
      pattern?: number;    // default: 0.4
      semantic?: number;   // default: 0.3
      nli?: number;       // default: 0.3
    };
    combinedThreshold?: number;  // default: 0.5
    // ... other options
  }
): Promise<FulfillmentResult> {
  
  const scores = {
    pattern: 0.0,
    semantic: 0.0,
    nli: 0.0
  };

  // Run all methods in parallel
  const promises: Promise<void>[] = [];

  if (usePatternMatching) {
    promises.push(
      (async () => {
        const result = checkPatternMatch(reference, searchText, effectiveNouns, effectiveSynonyms);
        scores.pattern = result.confidence || 0.0;
      })()
    );
  }

  if (useSemanticSimilarity) {
    promises.push(
      (async () => {
        const similarity = await computeSemanticSimilarity(reference, searchText);
        scores.semantic = similarity || 0.0;
      })()
    );
  }

  if (useNLIEntailment) {
    promises.push(
      (async () => {
        const premise = searchText;
        const hypothesis = `There is ${reference}`;
        const entailmentScore = await checkEntailment(premise, hypothesis);
        scores.nli = entailmentScore || 0.0;
      })()
    );
  }

  await Promise.all(promises);

  // Combine scores with weights
  const weights = {
    pattern: combineWeights?.pattern ?? 0.4,
    semantic: combineWeights?.semantic ?? 0.3,
    nli: combineWeights?.nli ?? 0.3
  };

  const combinedScore = 
    (scores.pattern * weights.pattern) +
    (scores.semantic * weights.semantic) +
    (scores.nli * weights.nli);

  const threshold = combinedThreshold ?? 0.5;

  if (combinedScore >= threshold) {
    return {
      status: 'fulfilled',
      method: 'combined',
      confidence: combinedScore,
      details: {
        patternScore: scores.pattern,
        similarityScore: scores.semantic,
        entailmentScore: scores.nli,
        combinedScore
      }
    };
  }

  return {
    status: 'unfulfilled',
    method: 'combined',
    confidence: combinedScore
  };
}
```

## Pattern Matching Details

Pattern matching is the first and fastest stage:

### Exact Match
- Searches for the head noun (e.g., "report" from "the report")
- Confidence: 0.9

### Synonym Match
- Searches for synonyms (e.g., "document", "paper" for "report")
- Confidence: 0.8

### Implementation

```typescript
function checkPatternMatch(
  reference: string,
  searchText: string,
  effectiveNouns: Set<string>,
  effectiveSynonyms: Record<string, Set<string>>
): FulfillmentResult {
  const normalizedRef = normalizePhrase(reference);
  const headNoun = extractHeadNoun(normalizedRef);
  
  // Exact match
  if (effectiveNouns.has(headNoun) && searchText.includes(headNoun)) {
    return {
      status: 'fulfilled',
      method: 'pattern',
      confidence: 0.9,
      details: { matchedText: headNoun }
    };
  }
  
  // Synonym match
  const synonyms = effectiveSynonyms[headNoun] || [];
  for (const synonym of synonyms) {
    if (searchText.includes(synoun)) {
      return {
        status: 'fulfilled',
        method: 'pattern',
        confidence: 0.8,
        details: { matchedText: synonym }
      };
    }
  }
  
  return {
    status: 'unfulfilled',
    method: 'pattern',
    confidence: 0.0
  };
}
```

## Context-Aware Matching

For long contexts, fulfillment checking can use specialized strategies:

### Chunked Matching

Splits long texts into overlapping chunks:

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
1. Split search text into chunks (500 chars each, 100 char overlap)
2. Run fulfillment check for each chunk
3. Return best result

**Why it's useful:**
- Long contexts can dilute similarity/entailment scores
- Chunking focuses on local relevance
- Overlap prevents missing matches at boundaries

### Sentence-Level Matching

Compares reference against individual sentences:

```typescript
{
  options: {
    useSentenceLevel: true
  }
}
```

**How it works:**
1. Split search text into sentences
2. Run fulfillment check for each sentence
3. Return best result

**Why it's useful:**
- More precise than full-text comparison
- Catches references to specific sentences
- Better for structured documents

### Phrase-Level Matching

Extracts and compares key phrases:

```typescript
{
  options: {
    usePhraseLevel: true
  }
}
```

**How it works:**
1. Extract noun phrases from both texts
2. Run fulfillment check for phrase pairs
3. Return best result

**Why it's useful:**
- Most precise matching
- Focuses on key terms
- Best for short, specific references

## Configuration

### Hierarchical Mode (Default)

```typescript
{
  options: {
    usePatternMatching: true,        // default: true
    useSemanticSimilarity: true,     // default: false
    useNLIEntailment: true,           // default: false
    similarityThreshold: 0.6,         // default: 0.6
    entailmentThreshold: 0.7          // default: 0.7
  }
}
```

### Combined Scoring Mode

```typescript
{
  options: {
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.4,    // default: 0.4
      semantic: 0.3,   // default: 0.3
      nli: 0.3         // default: 0.3
    },
    combinedThreshold: 0.5  // default: 0.5
  }
}
```

### Context-Aware Options

```typescript
{
  options: {
    useChunkedMatching: true,     // Auto-enabled for texts > 1000 chars
    chunkSize: 500,
    chunkOverlap: 100,
    useSentenceLevel: false,
    usePhraseLevel: false
  }
}
```

## Performance

### Hierarchical Mode
- **Best case:** <1ms (pattern match succeeds)
- **Worst case:** 300-500ms (all methods run, none succeed)
- **Average:** 50-200ms (pattern fails, semantic succeeds)

### Combined Scoring Mode
- **Always:** 200-500ms (all methods run in parallel)
- **Slower** but more accurate

## Best Practices

### When to Use Hierarchical
- Default behavior
- Speed is important
- Pattern matching is usually sufficient
- Most references are straightforward

### When to Use Combined Scoring
- Accuracy is critical
- Dealing with ambiguous references
- Need fine-grained control
- Willing to trade speed for accuracy

### Tuning Weights

**Pattern-heavy (fast, less accurate):**
```typescript
combineWeights: {
  pattern: 0.6,
  semantic: 0.2,
  nli: 0.2
}
```

**Balanced (default):**
```typescript
combineWeights: {
  pattern: 0.4,
  semantic: 0.3,
  nli: 0.3
}
```

**Semantic-heavy (slower, more accurate):**
```typescript
combineWeights: {
  pattern: 0.2,
  semantic: 0.4,
  nli: 0.4
}
```

## Next Steps

- [Semantic Analytics](./semantic-analytics.md) - Learn about embedding-based similarity
- [NLI Entailment](./nli-entailment.md) - Learn about NLI-based validation
- [Missing Reference Detection](../rules/missing-reference.md) - See how fulfillment checking is used

