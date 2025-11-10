# Changelog
## [0.1.3] - 2025-11-09

### Added

* **Lightweight inference mode** using ONNX-based NLI models (`distilbert-base-uncased-mnli`) under 400 MB total footprint.
* Support for **semantic entailment validation** across multi-turn contexts using ONNX Runtime for Node.js.
* **Forward-reference detector** for expressions like “the following …”, “as shown below”, “these files/data/items”.
* Optional **semantic similarity scoring** via `MiniLM-L6-v2` embeddings for paraphrase-aware fulfillment checks.
* JSON-formatted reporting for missing-referent diagnostics (term, turn, confidence, fulfillment status).

### Changed

* Refactored **MISSING_REFERENCE rule** to run hierarchical checks (pattern → semantic similarity → NLI entailment).
* Simplified SDK structure for modular Node.js usage (`forwardRefDetector`, `fulfillmentChecker`, `analyzer`).
* Reduced model size requirements from >1 GB to <400 MB total without major accuracy loss.
* Optimized ONNX session caching and tokenization throughput for short prompt analytics.

### Fixed

* False negatives when references spanned multiple turns (e.g., “the following data” followed by delayed content).
* Overlapping phrase detection now correctly handles nested forward-reference patterns.
* Tokenization mismatch bug when using UTF-8 multibyte symbols in entailment checks.


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
