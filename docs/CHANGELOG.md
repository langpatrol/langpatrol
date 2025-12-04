# Changelog
## [0.1.5] - 2025-12-04

### Added

* **Domain Context Checking (Cloud-only)** - New `OUT_OF_CONTEXT` error code for validating prompts match your domain activity:
  - Added `check_context` option with `domains` parameter to specify domain keywords/topics
  - Automatically routes to `/api/v1/ai-analytics` endpoint when `check_context` is provided
  - Requires API key and AI Analytics subscription (Pro tier or higher)
  - Returns high-severity `OUT_OF_CONTEXT` error when prompt doesn't match specified domains
  - Integrated into SDK with automatic validation (throws error if used without API key)
  - Added support in both cloud dashboard playground and LangPatrol dev UI

### Changed

* SDK now validates that `check_context` option is only used with `apiKey` provided
* When `check_context` is provided, SDK automatically routes to AI Analytics endpoint instead of standard analyze endpoint

## [0.1.4] - 2025-11-12

### Added

* **Benchmarking tools** - Comprehensive benchmarking suite in `tools/benchmark/` for evaluating analysis performance:
  - Multi-parameter testing with configurable parameter sets
  - Support for CSV datasets and text files
  - Comprehensive metrics (latency, issues, costs, rule timings)
  - Accuracy metrics (precision, recall, F1 score) when expected issues are provided
  - JSON reports, CSV tables, and interactive HTML charts with Chart.js
  - Parameter impact analysis showing how each parameter affects latency and accuracy
  - Parallel execution and warmup runs support
  - Timeout protection for large prompts
* **Schema validation rules** - New `INVALID_SCHEMA` issue code that validates JSON Schema structures:
  - Detects missing `type` when `properties` or `items` are present (strict mode requirement)
  - Validates type values against JSON Schema 7 specification
  - Validates property types recursively
  - Provides detailed error messages with schema paths and keywords
  - Uses strict Ajv validation with comprehensive error reporting
  - Can be disabled via `disabledRules: ['INVALID_SCHEMA']`
* **Synthetic prompt dataset** - Collection of test prompts for validation and benchmarking

## [0.1.3] - 2025-11-09

### Added

* **Lightweight inference mode** using ONNX-based NLI models (`distilbert-base-uncased-mnli`) under 400 MB total footprint.
* Support for **semantic entailment validation** across multi-turn contexts using ONNX Runtime for Node.js.
* **Forward-reference detector** for expressions like "the following …", "as shown below", "these files/data/items".
* Optional **semantic similarity scoring** via `MiniLM-L6-v2` embeddings for paraphrase-aware fulfillment checks.
* **Combined scoring mode** that runs pattern matching, semantic similarity, and NLI entailment in parallel and combines their scores with configurable weights.
* **NLP-based noun extraction** using TinyBERT NER model for dynamic noun detection (alternative to taxonomy-based approach).
* **Context-aware matching strategies**: chunked matching, sentence-level matching, phrase-level matching, and multi-hypothesis NLI.
* **Configurable pattern matching** - can be disabled to rely solely on semantic/NLI methods.
* **Verb filtering** in NLP extraction to prevent detecting verbs (e.g., "contain") as noun phrases.
* **Entity type filtering** in NLP extraction to only extract noun-like entities (MISC, ORG, PRODUCT, LOC, etc.).
* JSON-formatted reporting for missing-referent diagnostics (term, turn, confidence, fulfillment status, detailed scoring breakdown).

### Changed

* Refactored **MISSING_REFERENCE rule** to support both hierarchical checks (pattern → semantic similarity → NLI entailment) and combined scoring modes.
* Pattern matching is now optional and can be disabled via `usePatternMatching` option.
* NLP extraction filters entities to only noun-like types and excludes verbs for better accuracy.
* Simplified SDK structure for modular Node.js usage (`forwardRefDetector`, `fulfillmentChecker`, `analyzer`).
* Reduced model size requirements from >1 GB to <400 MB total without major accuracy loss.
* Optimized ONNX session caching and tokenization throughput for short prompt analytics.

### Fixed

* False negatives when references spanned multiple turns (e.g., "the following data" followed by delayed content).
* Overlapping phrase detection now correctly handles nested forward-reference patterns.
* Tokenization mismatch bug when using UTF-8 multibyte symbols in entailment checks.
* Pattern matching now correctly extracts head nouns from phrases like "the rows below" (extracts "rows" not "below").
* Search text construction now includes text before the reference in prompt-only scenarios for better context.


## [0.1.2] - 2025-11-06

### Fixed

- Context-aware synonym matching to reduce false positives (e.g., "This file" no longer incorrectly resolves "the report")
- Synonym matching now verifies context to avoid false positives from phrases like "this file", "the file", "a file"
- Bare mention resolution now includes context verification to prevent incorrect antecedent matching
- Confidence penalty system for synonym-based resolutions with large distance (>5000 chars) to reduce false positives

## [0.1.1] - 2025-11-06

### Added

- **Phase 2: Enhanced MISSING_REFERENCE detection**
  - Taxonomy-based noun classification (artifact, structure, communication, code classes)
  - Synonym matching for improved antecedent resolution (e.g., "paper" ↔ "document" ↔ "report")
  - Text normalization utility with singularization and punctuation stripping
  - Windowed antecedent search with configurable message/byte limits
  - Enhanced scoring system with confidence levels (low/medium/high)
  - Resolution tracking in evidence (unresolved, resolved-by-exact, resolved-by-synonym, resolved-by-memory, resolved-by-attachment)
  - User-extensible taxonomy via `referenceHeads` and `synonyms` options
  - Normalization handles plural forms (e.g., "reports" matches "report")

### Changed

- MISSING_REFERENCE rule now uses taxonomy-based detection instead of flat lexicon
- Antecedent search supports synonym matching and windowed history
- Confidence levels dynamically adjust based on history length and resolution method

## [0.1.0] - 2025-11-05

### Added

- Initial release with local heuristic validation
- Five rule categories: MISSING_PLACEHOLDER, MISSING_REFERENCE, CONFLICTING_INSTRUCTION, SCHEMA_RISK, TOKEN_OVERAGE
- CLI tool for analyzing prompts
- Dev server and UI for interactive testing
- Support for multiple template dialects (handlebars, jinja, mustache, ejs)
- Token estimation and cost projection
- JSON schema validation
- Fast tokenization modes: `auto`, `cheap`, `exact`, `off` for performance optimization
- Rule enable/disable toggles in dev UI
- File selector in dev UI for loading test prompts from `datasets/synthetic/`
- Split-pane layout with fixed analyze button in dev UI
- Per-rule timing measurements for performance analysis
- Early bail on large inputs via `maxChars` option
- SPDX license identifiers in all source files

### Changed

- Token estimation now uses adaptive two-level rule (cheap estimate first, exact only near limits)
- Dev UI restructured with left panel (controls) and right panel (results)
- Analyze button fixed at bottom of left panel for better UX

### Fixed

- Window scrolling issues in dev UI
- Path resolution for test file loading in dev server
- Regex state issues in MISSING_PLACEHOLDER and MISSING_REFERENCE rules
- Increased Express body size limit to 10MB for large prompts
