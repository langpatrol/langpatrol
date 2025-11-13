# Model Integration

## Overview

LangPatrol uses machine learning models for semantic similarity and NLI entailment. This document explains how to use custom models or modify the default model configuration.

## Default Models

### Semantic Similarity Model

- **Model:** `Xenova/all-MiniLM-L6-v2`
- **Size:** ~90 MB (quantized)
- **Task:** Feature extraction (embeddings)
- **Location:** `packages/engine/src/util/semanticSimilarity.ts`

### NLI Entailment Model

- **Model:** `Xenova/distilbert-base-uncased-mnli`
- **Size:** ~250 MB (quantized)
- **Task:** Zero-shot classification
- **Location:** `packages/engine/src/util/nliEntailment.ts`

### NLP Extraction Model (Optional)

- **Model:** `TinyBERT-finetuned-NER-ONNX` (local)
- **Size:** ~50 MB (quantized)
- **Task:** Token classification (NER)
- **Location:** `packages/engine/src/util/nlpExtract.ts`

## Using Custom Models

### Custom Semantic Similarity Model

1. **Prepare your model** - Must be in ONNX format, compatible with `@xenova/transformers`

2. **Modify `semanticSimilarity.ts`:**

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

3. **Rebuild the package:**

```bash
pnpm --filter @langpatrol/engine build
```

### Custom NLI Model

1. **Prepare your model** - Must be in ONNX format, support zero-shot classification

2. **Modify `nliEntailment.ts`:**

```typescript
async function getNLIPipeline(): Promise<ZeroShotClassificationPipeline> {
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

3. **Rebuild the package:**

```bash
pnpm --filter @langpatrol/engine build
```

### Custom NLP/NER Model

1. **Prepare your model** - Must be in ONNX format, support token classification

2. **Modify `nlpExtract.ts`:**

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

3. **Update entity type filtering** (if needed):

```typescript
const NOUN_ENTITY_TYPES = [
  'MISC', 'ORG', 'PRODUCT', 'LOC', 'PERSON', // Default labels
  'YOUR_CUSTOM_LABEL', // Add your custom labels
  // ...
];
```

4. **Rebuild the package:**

```bash
pnpm --filter @langpatrol/engine build
```

## Model Requirements

All custom models must:

1. **Be in ONNX format** (preferably quantized for smaller size)
2. **Include all required files:**
   - `config.json` - Model configuration
   - `model_quantized.onnx` or `model.onnx` - The model file
   - `tokenizer.json` - Tokenizer configuration
   - `tokenizer_config.json` - Tokenizer settings
   - `vocab.txt` - Vocabulary file (if applicable)

3. **Be compatible with `@xenova/transformers`:**
   - Models should work with the pipeline API
   - Output format should match expected structure

4. **Match the task type:**
   - NLI: `zero-shot-classification` or `text-classification`
   - NER: `token-classification`
   - Embeddings: `feature-extraction`

## Converting Models to ONNX

### Using HuggingFace Optimum

```bash
# Install optimum
pip install optimum[onnxruntime]

# Convert a model
optimum-cli export onnx --model your-model-name --task zero-shot-classification ./output-dir
```

### Using ONNX Runtime

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

## Using HuggingFace Models Directly

You can use models directly from HuggingFace without downloading them locally:

```typescript
// In semanticSimilarity.ts
embeddingPipeline = await pipeline(
  'feature-extraction',
  'your-username/your-model-name', // HuggingFace model ID
  { quantized: true }
);
```

The model will be automatically downloaded and cached on first use.

## Model Caching

Models are lazy-loaded and cached:

- **First call:** Model is downloaded/loaded (slower)
- **Subsequent calls:** Model is reused from cache (faster)
- **Cache location:** `~/.cache/huggingface/` (for HuggingFace models)

## Performance Considerations

### Model Size

- **Smaller models** - Faster inference, less memory
- **Larger models** - Better accuracy, more memory

### Quantization

Quantized models are smaller and faster:

```typescript
{ quantized: true }  // Reduces model size significantly
```

### Batch Processing

For multiple texts, batch processing can improve performance:

```typescript
// Process multiple texts at once
const embeddings = await Promise.all([
  pipeline(text1),
  pipeline(text2),
  pipeline(text3)
]);
```

## Troubleshooting

### Issue: Model not loading

**Check:**
- Model files are in the correct location
- All required files are present
- Model format is correct (ONNX)
- Model is compatible with `@xenova/transformers`

### Issue: Wrong output format

**Solution:** Verify the model's output matches expected format:
- NLI: Should return scores array
- NER: Should return array of entities with `word`, `start`, `end`, `entity` fields
- Embeddings: Should return tensor/array of embeddings

### Issue: Model too large

**Solution:** Use quantized models:

```typescript
{ quantized: true } // Reduces model size significantly
```

### Issue: Different entity labels

**Solution:** Update the `NOUN_ENTITY_TYPES` array to match your model's labels:

```typescript
const NOUN_ENTITY_TYPES = [
  // Add your model's entity type labels here
];
```

## Next Steps

- [Semantic Analytics](./semantic-analytics.md) - Learn about embedding-based similarity
- [NLI Entailment](./nli-entailment.md) - Learn about NLI-based validation
- [Missing Reference Detection](../rules/missing-reference.md) - See how models are used

