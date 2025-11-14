# Missing Reference Test Dataset Generator

Generates 300 test cases for missing reference detection using Ollama + Llama 3.1.

## Output Structure

Each test case is organized in its own directory:

```
missing_reference_dataset/
├── Customer_Support/
│   ├── test_0001/
│   │   ├── prompt.txt              # Final user prompt
│   │   ├── history.json            # Conversation history
│   │   ├── expected_output.json    # Expected detection results
│   │   └── prompt_annotated.txt    # Prompt with [MISSING_REFERENCE] tags
│   ├── test_0002/
│   │   └── ...
│   └── ...
├── Pharma_Tech/
│   └── ...
└── ...
```

## Setup

1. Install Ollama: https://ollama.ai
2. Pull Llama 3.1 model:
   ```bash
   ollama pull llama3.1
   ```
3. Start Ollama server (if not running):
   ```bash
   ollama serve
   ```
4. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

### Check Ollama availability:
```bash
python generate_missing_reference_dataset.py --check-ollama
```

### Generate dataset:
```bash
python generate_missing_reference_dataset.py --outdir ../missing_reference_dataset/ --cases 300
```

### Options:
- `--outdir`: Output directory (default: current directory)
- `--cases`: Number of test cases to generate (default: 300)
- `--check-ollama`: Check if Ollama is available before generating

## File Formats

### prompt.txt
The final user message containing potential missing references.

### history.json
Array of conversation messages:
```json
[
  {"role": "user", "content": "..."},
  {"role": "assistant", "content": "..."},
  ...
]
```

### expected_output.json
Expected detection results:
```json
{
  "expected_issue_codes": ["MISSING_REFERENCE"],
  "missing_references": [
    {
      "text": "the report",
      "start": 10,
      "end": 20,
      "type": "definite_noun"
    }
  ],
  "notes": "explanation"
}
```

### prompt_annotated.txt
The prompt with `[MISSING_REFERENCE]` annotations marking where references are missing.

## Sectors

1. Customer Support
2. Pharma/Tech
3. Booking Agent
4. E-commerce
5. Healthcare
6. Legal
7. Education
8. Finance

## Pattern Types

- **missing_definite**: "the report" without antecedent
- **missing_deictic**: "as discussed earlier" without context
- **missing_forward**: "the following report" that doesn't exist
- **resolved**: Reference with clear antecedent (should NOT flag)
- **mixed**: Multiple references, some resolved, some missing

