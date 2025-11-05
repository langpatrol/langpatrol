# Changelog

## [0.1.0] - 2025-01-XX

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
