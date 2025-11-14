# LangPatrol CLI

Command-line tool for analyzing prompts with LangPatrol.

## Installation

```bash
npm install -g langpatrol-cli
```

## Usage

```bash
langpatrol analyze <pathGlob> [options]
```

### Options

- `--json` - Output JSON report
- `--out <file>` - Write JSON report to file
- `--model <model>` - Model to use for token estimation (default: gpt-4o)

### Examples

```bash
# Analyze a single prompt file
langpatrol analyze prompt.txt

# Analyze multiple files and output JSON
langpatrol analyze "prompts/*.txt" --json --out report.json

# Specify model
langpatrol analyze prompt.txt --model gpt-4o-mini
```

## License

Elastic License 2.0

