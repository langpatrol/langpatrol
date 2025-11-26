# Dataset Generator

Python script to generate realistic test datasets using Ollama for LangPatrol SDK performance testing.

**Key Features:**
- ✅ **Incremental saving**: Each test case is saved immediately - safe to interrupt and resume
- ✅ **JSON format**: Structured JSON files in organized folder structure
- ✅ **Resume support**: Automatically resumes from existing test cases

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Configure Ollama in `.env` file (in project root):
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

Or use command-line arguments to override.

## Usage

### Basic Usage

Generate 10 test cases with default settings:
```bash
python generate_dataset.py
```

This creates a folder `datasets/generated_dataset/` with JSON files.

### Custom Dataset Name

Generate 50 test cases in a custom dataset folder:
```bash
python generate_dataset.py --dataset my_test_set --count 50 --tokens 5000
```

### Resume Generation

If the script is interrupted, it automatically resumes:
```bash
# First run (generates 20 cases, interrupted after 10)
python generate_dataset.py --dataset my_set --count 20

# Resume (will generate remaining 10 cases)
python generate_dataset.py --dataset my_set --count 20
```

### Without Message History

Generate prompts only (faster):
```bash
python generate_dataset.py --count 20 --no-messages
```

### Custom Model

Use a different Ollama model:
```bash
python generate_dataset.py --model llama3.1 --count 10
```

## Options

- `--count <n>`: Number of test cases to generate (default: 10)
- `--dataset <name>`: Dataset folder name (default: `generated_dataset`)
- `--tokens <n>`: Target tokens per prompt (default: 2000)
- `--model <name>`: Ollama model name (overrides .env)
- `--base-url <url>`: Ollama base URL (overrides .env)
- `--no-messages`: Skip generating message history (faster)

## Output Format

The script generates a folder structure with JSON files:

```
datasets/
  my_dataset/
    index.json              # Master index of all test cases
    ollama-gen-0001.json    # Individual test case
    ollama-gen-0002.json    # Individual test case
    ...
```

### JSON Structure

Each test case file (`ollama-gen-XXXX.json`):
```json
{
  "id": "ollama-gen-0001",
  "category": "ollama-generated",
  "prompt": "...",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "schema": null,
  "expectedIssueCodes": [],
  "notes": "Generated with Ollama model llama3.2, target tokens: 2000"
}
```

### Index File

The `index.json` file tracks all test cases:
```json
{
  "testCases": ["ollama-gen-0001", "ollama-gen-0002", ...],
  "metadata": {
    "totalTestCases": 10,
    "lastUpdated": "...",
    "format": "json"
  }
}
```

## Generated Issues

The script generates prompts that intentionally include:

1. **MISSING_PLACEHOLDER**: Template variables like `{{variable}}` that aren't defined
2. **MISSING_REFERENCE**: Phrases like "as discussed earlier", "the report above" without context
3. **CONFLICTING_INSTRUCTION**: Contradictory directives (e.g., "be concise" vs "detailed")
4. **SCHEMA_RISK**: JSON output requested but also narrative/explanations
5. **TOKEN_OVERAGE**: Token limits mentioned but prompts that would exceed them

## Incremental Saving

**Important**: The script saves each test case immediately after generation. This means:

- ✅ Safe to interrupt (Ctrl+C) - all generated cases are saved
- ✅ Can resume generation - run the same command again to continue
- ✅ No data loss if script crashes or is interrupted
- ✅ Progress is preserved automatically

Example:
```bash
# Start generating 100 cases
python generate_dataset.py --dataset large_set --count 100

# After 30 cases, interrupt with Ctrl+C
# All 30 cases are saved in datasets/large_set/

# Resume later - will continue from case 31
python generate_dataset.py --dataset large_set --count 100
```

## Running Benchmarks

The benchmark tool needs to be updated to support JSON format. For now, you can:

1. **Use the JSON files directly** (if benchmark tool is updated)
2. **Convert to CSV** using a simple script (see below)

### Converting JSON to CSV (if needed)

```python
import json
import csv
from pathlib import Path

dataset_dir = Path("datasets/my_dataset")
index_path = dataset_dir / "index.json"

with open(index_path) as f:
    index = json.load(f)

rows = []
for test_id in index["testCases"]:
    with open(dataset_dir / f"{test_id}.json") as f:
        tc = json.load(f)
        rows.append({
            "id": tc["id"],
            "category": tc["category"],
            "prompt": tc["prompt"],
            "messages_json": json.dumps(tc.get("messages", [])),
            "schema_json": json.dumps(tc.get("schema")),
            "expected_issue_codes": json.dumps(tc.get("expectedIssueCodes", [])),
            "notes": tc.get("notes", "")
        })

with open("dataset.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
```

## Performance Tips

1. **For large datasets**: Use `--no-messages` to skip message history generation (much faster)
2. **For quality**: Use larger models (e.g., `llama3.1` or `mistral`) for better prompt quality
3. **For speed**: Use smaller models (e.g., `llama3.2`) for faster generation
4. **Incremental generation**: Generate in batches - the script automatically resumes
5. **Safe interruption**: You can stop and resume anytime - no data loss

## Troubleshooting

### Connection Errors

If you get connection errors:
- Make sure Ollama is running: `ollama serve`
- Check the base URL matches your Ollama setup
- Verify the model is available: `ollama list`

### Slow Generation

- Use `--no-messages` to skip message history
- Use a smaller model
- Reduce `--tokens` target
- Generate in smaller batches (script saves incrementally, so safe to interrupt)

### Poor Quality Prompts

- Try a larger/better model
- Increase the `--tokens` target for more context
- The prompts are intentionally designed to have issues - this is expected!

