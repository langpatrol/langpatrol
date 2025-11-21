# LangPatrol Benchmarking Tool

A comprehensive benchmarking tool for evaluating LangPatrol's analysis performance across different parameter configurations and datasets.

## Features

- **Multi-parameter testing**: Run benchmarks with different configuration combinations
- **Dataset support**: Works with CSV datasets and text files
- **Comprehensive metrics**: Collects latency, issues, costs, and rule timings
- **Accuracy metrics**: Calculates precision, recall, and F1 score when expected issues are provided
- **JSON reports**: Saves detailed results in structured JSON format
- **CSV tables**: Generates CSV tables for easy analysis in spreadsheet tools
- **HTML charts**: Creates interactive HTML charts with Chart.js showing:
  - Execution time vs accuracy scatter plot
  - Accuracy metrics comparison (precision, recall, F1)
  - Execution time by parameter set
- **Parameter impact analysis**: CSV showing how each parameter affects latency and accuracy
- **Summary statistics**: Generates aggregated statistics by parameter set and test case
- **Warmup runs**: Supports warmup runs to account for model loading

## Installation

The benchmarking tool uses the same dependencies as the main project. No additional installation needed.

## Usage

### Basic Usage

Run with default parameter sets and dataset:

```bash
tsx tools/benchmark/benchmark.ts
```

### Custom Dataset

Specify a custom dataset (CSV file or directory with .txt files):

```bash
# CSV dataset
tsx tools/benchmark/benchmark.ts --dataset datasets/synthetic/synthetic_validation_dataset.csv

# Directory with text files
tsx tools/benchmark/benchmark.ts --dataset datasets/synthetic/
```

### Custom Output Path

```bash
tsx tools/benchmark/benchmark.ts --output results/my-benchmark.json
```

### Custom Parameter Sets

Create a JSON file with your parameter sets:

```json
[
  {
    "name": "my-config",
    "description": "Custom configuration",
    "options": {
      "useSemanticSimilarity": true,
      "similarityThreshold": 0.7,
      "useNLIEntailment": true
    }
  }
]
```

Then run:

```bash
tsx tools/benchmark/benchmark.ts --params my-params.json
```

### Multiple Iterations

Run each test case multiple times for statistical significance:

```bash
tsx tools/benchmark/benchmark.ts --iterations 5
```

### Warmup Runs

Specify number of warmup runs (useful for model loading):

```bash
tsx tools/benchmark/benchmark.ts --warmup 3
```

### Parallel Execution

Run multiple analyses in parallel for faster execution (especially useful for large datasets):

```bash
# Run 4 analyses in parallel
tsx tools/benchmark/benchmark.ts --concurrency 4

# For large prompts (20K+ tokens), use lower concurrency (2-4) to avoid memory issues
tsx tools/benchmark/benchmark.ts --concurrency 2 --dataset datasets/large/20k_prompt.txt
```

### Timeout Protection

Add timeout to prevent hangs on very large prompts:

```bash
# Set 5 minute timeout per analysis
tsx tools/benchmark/benchmark.ts --timeout 300000

# Combine with concurrency for optimal performance
tsx tools/benchmark/benchmark.ts --timeout 300000 --concurrency 2
```

## Default Parameter Sets

The tool includes 8 default parameter sets:

1. **baseline**: Pattern matching only
2. **semantic-similarity**: Semantic similarity enabled
3. **nli-entailment**: NLI entailment enabled
4. **semantic-nli-combined**: Both semantic and NLI
5. **nlp-extraction**: NLP extraction enabled
6. **conflict-semantic**: Conflict detection with semantic similarity
7. **conflict-nli**: Conflict detection with NLI
8. **all-features**: All features enabled

## Output Files

The benchmark tool generates multiple output files:

1. **`benchmark-results.json`** - Complete JSON report with all results
2. **`benchmark-results-table.csv`** - CSV table with key metrics for each parameter set
3. **`benchmark-results-chart.html`** - Interactive HTML chart with visualizations
4. **`benchmark-results-parameter-impact.csv`** - Analysis of how each parameter affects performance

### CSV Table Format

The CSV table includes:
- Parameter Set name
- Average Latency (ms)
- Precision, Recall, F1 Score
- True Positives, False Positives, False Negatives
- Total Issues detected
- Success Rate

### HTML Chart Features

The HTML chart includes:
- **Scatter Plot**: Execution time vs F1 Score (shows trade-offs)
- **Bar Chart**: Accuracy metrics comparison (Precision, Recall, F1)
- **Bar Chart**: Execution time by parameter set
- **Interactive Table**: Full results with color-coded metrics

### Parameter Impact Analysis

Shows how enabling each parameter affects:
- Average latency (with percentage change)
- Average F1 score (with percentage change)

This helps you understand the cost/benefit of each feature.

## JSON Report Format

The benchmark report is saved as JSON with the following structure:

```json
{
  "metadata": {
    "timestamp": "2025-01-10T12:00:00.000Z",
    "datasetPath": "/path/to/dataset",
    "totalTestCases": 100,
    "totalParameterSets": 8,
    "totalRuns": 800,
    "duration": 123456.78
  },
  "parameterSets": [
    {
      "name": "baseline",
      "description": "Baseline - pattern matching only",
      "options": { ... }
    }
  ],
  "results": [
    {
      "testCaseId": "test-001",
      "parameterSet": "baseline",
      "latency": 45.2,
      "issues": {
        "total": 3,
        "byCode": {
          "MISSING_REFERENCE": 2,
          "CONFLICTING_INSTRUCTION": 1
        },
        "details": [ ... ]
      },
      "cost": {
        "estInputTokens": 150,
        "charCount": 500
      },
      "meta": {
        "latencyMs": 45.2,
        "ruleTimings": {
          "reference": 10.5,
          "conflicts": 5.2
        }
      }
    }
  ],
  "summary": {
    "byParameterSet": {
      "baseline": {
        "totalRuns": 100,
        "successRate": 1.0,
        "avgLatency": 45.2,
        "totalIssues": 300,
        "issuesByCode": { ... },
        "avgRuleTimings": { ... }
      }
    },
    "byTestCase": {
      "test-001": {
        "runs": 8,
        "avgLatency": 45.2,
        "issuesFound": { ... }
      }
    }
  }
}
```

## Metrics Collected

- **Latency**: Time taken for each analysis run (ms)
- **Issues**: Total count and breakdown by issue code
- **Accuracy** (when expected issues provided):
  - **Precision**: True positives / (True positives + False positives)
  - **Recall**: True positives / (True positives + False negatives)
  - **F1 Score**: Harmonic mean of precision and recall
  - **True Positives**: Correctly detected issues
  - **False Positives**: Issues detected but not expected
  - **False Negatives**: Expected issues not detected
- **Cost**: Estimated input tokens and character count
- **Rule Timings**: Performance breakdown by rule
- **Success Rate**: Percentage of successful runs
- **Error Tracking**: Captures and reports errors

## Examples

### Compare Semantic vs NLI

```bash
# Create custom params file
cat > semantic-vs-nli.json << EOF
[
  {
    "name": "semantic-only",
    "options": {
      "useSemanticSimilarity": true,
      "similarityThreshold": 0.6
    }
  },
  {
    "name": "nli-only",
    "options": {
      "useNLIEntailment": true,
      "similarityThreshold": 0.6
    }
  }
]
EOF

# Run benchmark
tsx tools/benchmark/benchmark.ts --params semantic-vs-nli.json --output semantic-vs-nli-results.json
```

### Performance Testing

```bash
# Run with multiple iterations for statistical significance
tsx tools/benchmark/benchmark.ts --iterations 10 --warmup 2 --output performance-results.json
```

### Threshold Tuning

```bash
# Create params file with different thresholds
cat > threshold-tuning.json << EOF
[
  {
    "name": "threshold-0.5",
    "options": {
      "useSemanticSimilarity": true,
      "similarityThreshold": 0.5
    }
  },
  {
    "name": "threshold-0.6",
    "options": {
      "useSemanticSimilarity": true,
      "similarityThreshold": 0.6
    }
  },
  {
    "name": "threshold-0.7",
    "options": {
      "useSemanticSimilarity": true,
      "similarityThreshold": 0.7
    }
  }
]
EOF

tsx tools/benchmark/benchmark.ts --params threshold-tuning.json --output threshold-results.json
```

## Viewing Results

### HTML Chart

Open the generated HTML file in your browser:

```bash
open benchmark-results-chart.html
# or
xdg-open benchmark-results-chart.html  # Linux
```

The chart includes interactive visualizations that help you:
- **Identify trade-offs**: See which parameter sets offer the best balance of speed and accuracy
- **Compare metrics**: Easily compare precision, recall, and F1 scores across parameter sets
- **Spot outliers**: Quickly identify parameter sets with unusually high latency or low accuracy

### CSV Tables

Open the CSV files in Excel, Google Sheets, or any spreadsheet application:

```bash
# Main results table
open benchmark-results-table.csv

# Parameter impact analysis
open benchmark-results-parameter-impact.csv
```

Use the CSV files to:
- Create custom visualizations
- Perform statistical analysis
- Share results with team members
- Track performance over time

## Analyzing Results Programmatically

The JSON report can be analyzed programmatically:

```typescript
import { readFileSync } from 'node:fs';
import type { BenchmarkReport } from './benchmark';

const report: BenchmarkReport = JSON.parse(
  readFileSync('benchmark-results.json', 'utf-8')
);

// Find fastest parameter set
const fastest = Object.entries(report.summary.byParameterSet)
  .sort((a, b) => a[1].avgLatency - b[1].avgLatency)[0];

console.log(`Fastest: ${fastest[0]} (${fastest[1].avgLatency.toFixed(2)}ms)`);

// Find parameter set with most issues detected
const mostIssues = Object.entries(report.summary.byParameterSet)
  .sort((a, b) => b[1].totalIssues - a[1].totalIssues)[0];

console.log(`Most issues: ${mostIssues[0]} (${mostIssues[1].totalIssues} issues)`);
```

## Integration with CI/CD

Add to your CI pipeline:

```yaml
# .github/workflows/benchmark.yml
name: Benchmark
on: [push, pull_request]
jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm build
      - run: tsx tools/benchmark/benchmark.ts --output benchmark-results.json
      - uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: benchmark-results.json
```

## Tips

1. **Start small**: Test with a subset of your dataset first
2. **Warmup runs**: Use warmup runs to account for model loading time
3. **Multiple iterations**: Run multiple iterations for statistical significance
4. **Custom parameters**: Create focused parameter sets for specific comparisons
5. **Monitor memory**: Large datasets with all features enabled can use significant memory
6. **Use parallel execution**: For large datasets, use `--concurrency 4-8` to speed up execution
7. **Large prompts**: For 20K+ token prompts, use `--concurrency 2-4` and `--timeout 300000` to prevent hangs
8. **Progress monitoring**: The tool shows real-time progress with current test case and parameter set being processed

## Troubleshooting

### Out of Memory

If you encounter memory issues:
- Reduce dataset size
- Disable some features (semantic/NLI)
- Run benchmarks in batches

### Slow Performance

- Use parallel execution: `--concurrency 4` or higher (be careful with memory on large prompts)
- Reduce iterations
- Skip warmup runs (if models are already loaded)
- Use timeout to prevent hangs: `--timeout 300000` (5 minutes)
- For very large prompts (20K+ tokens), use lower concurrency (2-4) to balance speed and memory

### Missing Results

- Check that dataset path is correct
- Verify parameter set options are valid
- Check for errors in the results array

