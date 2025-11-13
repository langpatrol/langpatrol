# Missing Reference Detection

## Overview

The Missing Reference Detection system identifies references to entities (like "the report", "this file", "the rows below") that lack clear antecedents in the conversation history or prompt context. This helps catch ambiguous prompts that may confuse LLMs.

The system uses a multi-stage pipeline that combines:
- **Pattern Matching**: Fast exact/synonym matching
- **Semantic Similarity**: Embedding-based paraphrase detection
- **NLI Entailment**: Natural Language Inference for logical validation
- **NLP Extraction**: Dynamic noun extraction using NER models

## Pipeline Architecture

### 1. Candidate Detection Phase

The system first identifies potential references in the text:

#### A. Definite Noun Phrases
Detects phrases like "the report", "this file", "that list" using regex patterns:
- Pattern: `/\b(the|this|that|these|those)\s+([a-z][a-z0-9_-]{2,})\b/gi`
- Extracts the head noun (e.g., "report" from "the report")

#### B. Forward References
Detects forward-looking references like:
- "the following report"
- "as shown below"
- "these files"
- "the rows below"

#### C. Deictic Cues
Detects vague references like "this", "that", "these", "those" without clear nouns.

### 2. Noun Extraction Methods

#### Taxonomy-Based (Default)
Uses a predefined taxonomy of common nouns:
- Artifacts: report, document, paper, file, etc.
- Structures: list, table, dataset, grid, etc.
- Communication: conversation, thread, message, etc.
- Code: snippet, script, function, etc.

**Configuration:**
```typescript
{
  options: {
    referenceHeads: ['custom-noun', 'another-noun'], // Extend taxonomy
    synonyms: {
      'report': ['document', 'paper', 'memo']
    }
  }
}
```

#### NLP-Based (Optional)
Uses TinyBERT NER model for dynamic noun extraction:
- Automatically detects nouns from text
- Filters to noun-like entity types (MISC, ORG, PRODUCT, LOC, etc.)
- Better coverage for domain-specific terms

**Configuration:**
```typescript
{
  options: {
    useNLPExtraction: true // Enable NLP-based extraction
  }
}
```

### 3. Fulfillment Checking Phase

For each candidate reference, the system checks if an antecedent exists using one of two approaches:

#### Hierarchical Approach (Default)
Runs methods sequentially, stopping at first match:

1. **Pattern Matching** (synchronous, fast)
   - Exact word match: "the report" → searches for "report" or "reports"
   - Synonym match: "the report" → searches for synonyms like "document", "paper"
   - Confidence: 0.9 (exact), 0.8 (synonym)

2. **Semantic Similarity** (async, if enabled)
   - Uses MiniLM-L6-v2 embeddings
   - Computes cosine similarity between reference and search text
   - Threshold: 0.6 (default)
   - Catches paraphrases: "the report" matches "sales document"

3. **NLI Entailment** (async, if enabled)
   - Uses distilbert-base-uncased-mnli model
   - Checks if search text entails the reference
   - Hypothesis: "There is the report"
   - Premise: search text (history/context)
   - Threshold: 0.7 (default)

#### Combined Scoring Approach (Optional)
Runs all methods in parallel and combines scores:

```typescript
combinedScore = (patternScore × patternWeight) + 
                (similarityScore × semanticWeight) + 
                (entailmentScore × nliWeight)
```

**Default Weights:**
- Pattern: 0.4
- Semantic: 0.3
- NLI: 0.3

**Configuration:**
```typescript
{
  options: {
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.4,
      semantic: 0.3,
      nli: 0.3
    },
    combinedThreshold: 0.5
  }
}
```

### 4. Context-Aware Matching Options

For long contexts, the system offers specialized matching strategies:

#### Chunked Matching
Splits long texts into overlapping chunks for comparison:
```typescript
{
  options: {
    useChunkedMatching: true, // Auto-enabled for texts > 1000 chars
    chunkSize: 500,
    chunkOverlap: 100
  }
}
```

#### Sentence-Level Matching
Compares reference against individual sentences:
```typescript
{
  options: {
    useSentenceLevel: true
  }
}
```

#### Phrase-Level Matching
Extracts and compares key phrases:
```typescript
{
  options: {
    usePhraseLevel: true
  }
}
```

#### Multi-Hypothesis NLI
Generates multiple hypotheses for better matching:
```typescript
{
  options: {
    useMultiHypothesis: true // Default: true
  }
}
```

## Configuration Options

### Basic Options

```typescript
{
  options: {
    // Enable/disable pattern matching (default: true)
    usePatternMatching: true,
    
    // Enable semantic similarity (default: false)
    useSemanticSimilarity: true,
    
    // Enable NLI entailment (default: false)
    useNLIEntailment: true,
    
    // Similarity threshold (default: 0.6)
    similarityThreshold: 0.6,
    
    // Use NLP extraction instead of taxonomy (default: false)
    useNLPExtraction: false
  }
}
```

### Advanced Options

```typescript
{
  options: {
    // Use combined scoring instead of hierarchical
    useCombinedScoring: true,
    
    // Custom weights for combined scoring
    combineWeights: {
      pattern: 0.4,
      semantic: 0.3,
      nli: 0.3
    },
    
    // Threshold for combined score (default: 0.5)
    combinedThreshold: 0.5,
    
    // Context-aware matching
    useChunkedMatching: true,
    chunkSize: 500,
    chunkOverlap: 100,
    useSentenceLevel: false,
    usePhraseLevel: false,
    useMultiHypothesis: true,
    
    // Limit search window
    antecedentWindow: {
      messages: 10, // Max messages to search back
      bytes: 50000  // Max bytes to search back
    },
    
    // Extend taxonomy
    referenceHeads: ['custom-noun'],
    
    // Custom synonyms
    synonyms: {
      'report': ['document', 'paper']
    }
  }
}
```

## Code Examples

### Example 1: Basic Detection (Pattern Matching Only)

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Summarize the report.',
  model: 'gpt-4o',
  options: {
    usePatternMatching: true,
    useSemanticSimilarity: false,
    useNLIEntailment: false
  }
});

console.log(report.issues);
// Output:
// [
//   {
//     code: 'MISSING_REFERENCE',
//     detail: 'References "the report" without antecedent...',
//     evidence: {
//       occurrences: [
//         {
//           text: 'the report',
//           fulfillmentStatus: 'unfulfilled',
//           fulfillmentMethod: 'pattern',
//           fulfillmentConfidence: 0.0
//         }
//       ]
//     }
//   }
// ]
```

### Example 2: With Message History (Resolved)

```typescript
const report = await analyzePrompt({
  messages: [
    { role: 'user', content: 'I have a sales document with Q3 data.' },
    { role: 'assistant', content: 'Got it.' },
    { role: 'user', content: 'Summarize the report.' }
  ],
  model: 'gpt-4o',
  options: {
    usePatternMatching: true,
    useSemanticSimilarity: true,
    similarityThreshold: 0.6
  }
});

// "the report" is resolved via synonym match:
// "document" (in history) → synonym of "report"
// No issues reported
```

### Example 3: Semantic Similarity Detection

```typescript
const report = await analyzePrompt({
  messages: [
    { role: 'user', content: 'Here is the quarterly sales data: ...' },
    { role: 'user', content: 'Analyze the report.' }
  ],
  model: 'gpt-4o',
  options: {
    usePatternMatching: false, // Disable pattern matching
    useSemanticSimilarity: true,
    similarityThreshold: 0.6
  }
});

// "the report" matches "sales data" via semantic similarity
// Similarity score: 0.72 (above threshold)
```

### Example 4: Combined Scoring

```typescript
const report = await analyzePrompt({
  messages: [
    { role: 'user', content: 'I uploaded a document about inventory.' },
    { role: 'user', content: 'Review the file and highlight issues.' }
  ],
  model: 'gpt-4o',
  options: {
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.3,
      semantic: 0.4,
      nli: 0.3
    },
    combinedThreshold: 0.5,
    useSemanticSimilarity: true,
    useNLIEntailment: true
  }
});

// Results show combined scores:
// {
//   fulfillmentStatus: 'fulfilled',
//   fulfillmentMethod: 'combined',
//   fulfillmentConfidence: 0.65,
//   fulfillmentDetails: {
//     patternScore: 0.8,      // "file" matches "document" via synonym
//     similarityScore: 0.72,   // Semantic match
//     entailmentScore: 0.68,   // NLI validation
//     combinedScore: 0.65      // Weighted average
//   }
// }
```

### Example 5: NLP Extraction for Domain Terms

```typescript
const report = await analyzePrompt({
  prompt: 'Highlight the rows below that contain missing SKU numbers.',
  model: 'gpt-4o',
  options: {
    useNLPExtraction: true, // Use NER model instead of taxonomy
    useSemanticSimilarity: true,
    useNLIEntailment: true
  }
});

// NLP extraction finds "rows" as a noun (not in default taxonomy)
// System can now detect "the rows" as a potential reference
```

### Example 6: Forward Reference Detection

```typescript
const report = await analyzePrompt({
  prompt: 'The following contains the data:\n1. Item A\n2. Item B\n\nProcess the list above.',
  model: 'gpt-4o'
});

// Detects:
// - "the following" (forward reference at start)
// - "the list above" (backward reference)
// Both are flagged if no clear antecedent
```

## Response Format

### Issue Structure

```typescript
{
  id: "iss_abc123",
  code: "MISSING_REFERENCE",
  severity: "high" | "medium" | "low",
  detail: "References \"the report\", \"the file\" without antecedent...",
  evidence: {
    summary: [
      { text: "the report", count: 3 },
      { text: "the file", count: 1 }
    ],
    occurrences: [
      {
        text: "the report",
        start: 10,
        end: 20,
        preview: "Summarize the report. The report should...",
        messageIndex: 0,
        resolution: "unresolved" | "resolved-by-exact" | "resolved-by-synonym" | ...,
        fulfillmentStatus: "fulfilled" | "unfulfilled" | "uncertain",
        fulfillmentMethod: "pattern" | "semantic-similarity" | "nli-entailment" | "combined" | "none",
        fulfillmentConfidence: 0.85,
        fulfillmentDetails: {
          patternScore: 0.9,
          similarityScore: 0.72,
          entailmentScore: 0.68,
          combinedScore: 0.75,
          matchedText: "report"
        },
        term: "report",
        turn: 0
      }
    ],
    firstSeenAt: { char: 10 }
  },
  scope: {
    type: "prompt" | "messages",
    messageIndex?: 0
  },
  confidence: "low" | "medium" | "high"
}
```

### Fulfillment Status

- **`fulfilled`**: Antecedent found, reference is resolved
- **`unfulfilled`**: No antecedent found, reference is missing
- **`uncertain`**: Ambiguous case, may or may not be resolved

### Fulfillment Method

- **`pattern`**: Resolved via exact/synonym matching
- **`semantic-similarity`**: Resolved via embedding similarity
- **`nli-entailment`**: Resolved via NLI validation
- **`combined`**: Resolved via combined scoring
- **`none`**: No method found a match

## Best Practices

### 1. When to Use Pattern Matching Only

Use for:
- Fast, lightweight detection
- Exact matches are sufficient
- No need for paraphrase detection

```typescript
{
  options: {
    usePatternMatching: true,
    useSemanticSimilarity: false,
    useNLIEntailment: false
  }
}
```

### 2. When to Use Semantic Features

Use for:
- Paraphrase detection ("the report" vs "sales document")
- Domain-specific terminology
- Multi-turn conversations with context

```typescript
{
  options: {
    usePatternMatching: true,
    useSemanticSimilarity: true,
    useNLIEntailment: true,
    similarityThreshold: 0.6
  }
}
```

### 3. When to Use Combined Scoring

Use for:
- Maximum accuracy
- Balancing multiple signals
- Fine-tuning detection sensitivity

```typescript
{
  options: {
    useCombinedScoring: true,
    combineWeights: {
      pattern: 0.4,
      semantic: 0.3,
      nli: 0.3
    },
    combinedThreshold: 0.5
  }
}
```

### 4. When to Use NLP Extraction

Use for:
- Domain-specific nouns not in taxonomy
- Dynamic noun detection
- Better coverage for specialized terms

```typescript
{
  options: {
    useNLPExtraction: true
  }
}
```

### 5. Tuning Thresholds

- **Lower `similarityThreshold` (e.g., 0.5)**: More lenient, catches more paraphrases
- **Higher `similarityThreshold` (e.g., 0.7)**: More strict, fewer false positives
- **Lower `combinedThreshold` (e.g., 0.4)**: More lenient combined scoring
- **Higher `combinedThreshold` (e.g., 0.6)**: More strict combined scoring

## Troubleshooting

### Issue: Too Many False Positives

**Solution**: Increase thresholds or disable pattern matching
```typescript
{
  options: {
    usePatternMatching: false,
    similarityThreshold: 0.7,
    combinedThreshold: 0.6
  }
}
```

### Issue: Missing Domain-Specific Terms

**Solution**: Use NLP extraction or extend taxonomy
```typescript
{
  options: {
    useNLPExtraction: true,
    // OR
    referenceHeads: ['sku', 'inventory-item', 'product-code']
  }
}
```

### Issue: Not Detecting Paraphrases

**Solution**: Enable semantic similarity
```typescript
{
  options: {
    useSemanticSimilarity: true,
    similarityThreshold: 0.6
  }
}
```

### Issue: Slow Performance

**Solution**: Disable semantic features or use pattern matching only
```typescript
{
  options: {
    usePatternMatching: true,
    useSemanticSimilarity: false,
    useNLIEntailment: false
  }
}
```

## Model Requirements

### Semantic Similarity
- Model: `Xenova/all-MiniLM-L6-v2`
- Size: ~90 MB (quantized)
- Task: Feature extraction (embeddings)

### NLI Entailment
- Model: `Xenova/distilbert-base-uncased-mnli`
- Size: ~250 MB (quantized)
- Task: Zero-shot classification

### NLP Extraction (Optional)
- Model: `TinyBERT-finetuned-NER-ONNX` (local)
- Size: ~50 MB (quantized)
- Task: Token classification (NER)

**Total footprint**: <400 MB when all features enabled

## Performance Considerations

- **Pattern Matching**: Synchronous, <1ms per reference
- **Semantic Similarity**: Async, ~50-200ms per reference (first call includes model load)
- **NLI Entailment**: Async, ~100-300ms per reference (first call includes model load)
- **NLP Extraction**: Async, ~200-500ms per text (first call includes model load)

Models are lazy-loaded on first use and cached for subsequent calls.

## Using Custom Models

You can use custom NLI or NLP models instead of the default ones. This is useful for:
- Domain-specific models
- Different languages
- Custom fine-tuned models
- Alternative model architectures

### Custom NLI Model

To use a custom NLI model for entailment checking:

1. **Download or prepare your ONNX model**
   - The model must be in ONNX format
   - Should support zero-shot classification or text classification
   - Compatible with `@xenova/transformers`

2. **Place the model in the project**
   ```
   packages/engine/src/models/your-custom-nli-model/
   ├── config.json
   ├── model_quantized.onnx
   ├── tokenizer.json
   ├── tokenizer_config.json
   └── vocab.txt
   ```

3. **Modify the model loading code**
   
   Edit `packages/engine/src/util/nliEntailment.ts`:
   
   ```typescript
   async function getNLIPipeline(): Promise<any> {
     if (!nliPipeline) {
       // Option 1: Use local model path
       const modelPath = join(__dirname, '../models/your-custom-nli-model');
       nliPipeline = await pipeline(
         'zero-shot-classification',
         modelPath,
         { quantized: true }
       );
       
       // Option 2: Use HuggingFace model ID
       // nliPipeline = await pipeline(
       //   'zero-shot-classification',
       //   'your-username/your-model-name',
       //   { quantized: true }
       // );
     }
     return nliPipeline;
   }
   ```

4. **Rebuild the package**
   ```bash
   pnpm --filter @langpatrol/engine build
   ```

### Custom NLP/NER Model

To use a custom NER model for noun extraction:

1. **Download or prepare your ONNX model**
   - The model must be in ONNX format
   - Should support token classification (NER)
   - Compatible with `@xenova/transformers`

2. **Place the model in the project**
   ```
   packages/engine/src/models/your-custom-ner-model/
   ├── config.json
   ├── model_quantized.onnx
   ├── tokenizer.json
   ├── tokenizer_config.json
   └── vocab.txt
   ```

3. **Modify the model loading code**
   
   Edit `packages/engine/src/util/nlpExtract.ts`:
   
   ```typescript
   async function getNERPipeline(): Promise<TokenClassificationPipeline> {
     if (!nerPipeline) {
       // Option 1: Use local model path
       const modelPath = join(__dirname, '../models/your-custom-ner-model');
       nerPipeline = await pipeline(
         'token-classification',
         modelPath,
         { quantized: true }
       );
       
       // Option 2: Use HuggingFace model ID
       // nerPipeline = await pipeline(
       //   'token-classification',
       //   'your-username/your-model-name',
       //   { quantized: true }
       // );
     }
     return nerPipeline;
   }
   ```

4. **Update entity type filtering (if needed)**
   
   If your model uses different entity type labels, update the `NOUN_ENTITY_TYPES` array:
   
   ```typescript
   const NOUN_ENTITY_TYPES = [
     'MISC', 'ORG', 'PRODUCT', 'LOC', 'PERSON', // Default labels
     'YOUR_CUSTOM_LABEL', // Add your custom labels
     // ...
   ];
   ```

5. **Rebuild the package**
   ```bash
   pnpm --filter @langpatrol/engine build
   ```

### Custom Semantic Similarity Model

To use a custom embedding model:

1. **Download or prepare your ONNX model**
   - The model must be in ONNX format
   - Should support feature extraction (embeddings)
   - Compatible with `@xenova/transformers`

2. **Place the model in the project**
   ```
   packages/engine/src/models/your-custom-embedding-model/
   ├── config.json
   ├── model_quantized.onnx
   ├── tokenizer.json
   ├── tokenizer_config.json
   └── vocab.txt
   ```

3. **Modify the model loading code**
   
   Edit `packages/engine/src/util/semanticSimilarity.ts`:
   
   ```typescript
   async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
     if (!embeddingPipeline) {
       // Option 1: Use local model path
       const modelPath = join(__dirname, '../models/your-custom-embedding-model');
       embeddingPipeline = await pipeline(
         'feature-extraction',
         modelPath,
         { quantized: true }
       );
       
       // Option 2: Use HuggingFace model ID
       // embeddingPipeline = await pipeline(
       //   'feature-extraction',
       //   'your-username/your-model-name',
       //   { quantized: true }
       // );
     }
     return embeddingPipeline;
   }
   ```

4. **Rebuild the package**
   ```bash
   pnpm --filter @langpatrol/engine build
   ```

### Converting Models to ONNX Format

If you have a PyTorch or TensorFlow model, you'll need to convert it to ONNX:

#### Using HuggingFace Optimum

```bash
# Install optimum
pip install optimum[onnxruntime]

# Convert a model
optimum-cli export onnx --model your-model-name --task zero-shot-classification ./output-dir
```

#### Using ONNX Runtime

```python
from transformers import AutoModel, AutoTokenizer
import torch.onnx

model = AutoModel.from_pretrained("your-model-name")
tokenizer = AutoTokenizer.from_pretrained("your-model-name")

# Export to ONNX
torch.onnx.export(
    model,
    dummy_input,
    "model.onnx",
    input_names=['input_ids', 'attention_mask'],
    output_names=['logits'],
    dynamic_axes={'input_ids': {0: 'batch', 1: 'sequence'}}
)
```

### Model Requirements

All custom models must:

1. **Be in ONNX format** (preferably quantized for smaller size)
2. **Include all required files**:
   - `config.json` - Model configuration
   - `model_quantized.onnx` or `model.onnx` - The model file
   - `tokenizer.json` - Tokenizer configuration
   - `tokenizer_config.json` - Tokenizer settings
   - `vocab.txt` - Vocabulary file (if applicable)

3. **Be compatible with `@xenova/transformers`**:
   - Models should work with the pipeline API
   - Output format should match expected structure

4. **Match the task type**:
   - NLI: `zero-shot-classification` or `text-classification`
   - NER: `token-classification`
   - Embeddings: `feature-extraction`

### Using HuggingFace Models Directly

You can also use models directly from HuggingFace without downloading them locally:

```typescript
// In nliEntailment.ts
nliPipeline = await pipeline(
  'zero-shot-classification',
  'your-username/your-model-name', // HuggingFace model ID
  { quantized: true }
);
```

The model will be automatically downloaded and cached on first use.

### Example: Using a Multilingual NER Model

```typescript
// In nlpExtract.ts
async function getNERPipeline(): Promise<TokenClassificationPipeline> {
  if (!nerPipeline) {
    // Use a multilingual NER model
    nerPipeline = await pipeline(
      'token-classification',
      'Xenova/multilingual-ner', // Example multilingual model
      { quantized: true }
    );
  }
  return nerPipeline;
}
```

### Troubleshooting Custom Models

#### Issue: Model not loading

**Check:**
- Model files are in the correct location
- All required files are present
- Model format is correct (ONNX)
- Model is compatible with `@xenova/transformers`

#### Issue: Wrong output format

**Solution:** Verify the model's output matches expected format:
- NLI: Should return scores array
- NER: Should return array of entities with `word`, `start`, `end`, `entity` fields
- Embeddings: Should return tensor/array of embeddings

#### Issue: Model too large

**Solution:** Use quantized models:
```typescript
{ quantized: true } // Reduces model size significantly
```

#### Issue: Different entity labels

**Solution:** Update the `NOUN_ENTITY_TYPES` array to match your model's labels:
```typescript
const NOUN_ENTITY_TYPES = [
  // Add your model's entity type labels here
];
```

