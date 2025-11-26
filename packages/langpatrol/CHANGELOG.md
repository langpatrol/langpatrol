# langpatrol

## 0.1.4

### Minor Changes

- **Added benchmarking tools** - Comprehensive benchmarking suite in `tools/benchmark/` for evaluating analysis performance across different parameter configurations and datasets. Features include:
  - Multi-parameter testing with configurable parameter sets
  - Support for CSV datasets and text files
  - Comprehensive metrics (latency, issues, costs, rule timings)
  - Accuracy metrics (precision, recall, F1 score)
  - JSON reports, CSV tables, and interactive HTML charts
  - Parameter impact analysis
  - Parallel execution and warmup runs support
- **Added schema validation rules** - New `INVALID_SCHEMA` issue code that validates JSON Schema structures and detects:
  - Missing `type` when `properties` or `items` are present
  - Invalid type values
  - Invalid property types
  - Other JSON Schema validation errors via Ajv
- **Added synthetic prompt dataset** - Collection of test prompts for validation and benchmarking

### Patch Changes

- Updated dependencies
  - @langpatrol/engine@0.1.4
