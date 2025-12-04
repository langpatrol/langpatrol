# @langpatrol/engine

## 0.1.5

### Minor Changes

- **Added domain context checking support** - Added `check_context` option to `AnalyzeInput` type:
  - New `check_context` option with `domains` parameter for cloud API domain validation
  - Cloud API options (`apiKey`, `apiBaseUrl`) added to options type
  - Supports `OUT_OF_CONTEXT` error code (cloud-only feature)

## 0.1.4

### Minor Changes

- **Added schema validation rules** - New `INVALID_SCHEMA` issue code that validates JSON Schema structures:
  - Detects missing `type` when `properties` or `items` are present (strict mode requirement)
  - Validates type values against JSON Schema 7 specification
  - Validates property types recursively
  - Provides detailed error messages with schema paths and keywords
  - Uses strict Ajv validation with comprehensive error reporting
  - Can be disabled via `disabledRules: ['INVALID_SCHEMA']`
