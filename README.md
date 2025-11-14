# LangPatrol

Developer SDK for pre-inference prompt validation and linting — think of it as ESLint or Prettier, but for prompts sent to large language models.

## Overview

Before a developer's app sends a prompt to an LLM like GPT-5, LangPatrol runs a fast, local analysis to catch common prompt bugs that waste tokens or produce unreliable outputs.

**Note:** This SDK runs locally only and is not deployed as a service. All analysis happens in your environment.

We're building LangPatrol in the open — expect rough edges as we iterate fast.

## Installation

```bash
npm install langpatrol
```

## Quick Start

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Summarize the report.',
  model: 'gpt-5'
});

if (report.issues.length) {
  console.log('Issues found:', report.issues);
}
```

## Features

LangPatrol detects five categories of issues:

1. **MISSING_PLACEHOLDER** - Unresolved template variables (e.g. `{{customer_name}}` not filled)
2. **MISSING_REFERENCE** - Deictic references ("the report", "continue the list") with no prior content
3. **CONFLICTING_INSTRUCTION** - Contradictory directives ("be concise" and "give a detailed explanation")
4. **SCHEMA_RISK** - Prompts requesting JSON but also prose or commentary around it
5. **TOKEN_OVERAGE** - Estimated token length exceeding model context or cost limits

## Monorepo Structure

This is a pnpm workspace monorepo:

- `packages/engine` - Core analysis engine (Elastic License 2.0)
- `packages/langpatrol` - Public SDK (Elastic License 2.0)
- `packages/cli` - Command-line tool (Elastic License 2.0)
- `packages/rules` - Shared lexicons and patterns (Elastic License 2.0)
- `apps/devserver` - Express API for testing
- `apps/devui` - React/Vite UI for interactive testing

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Start dev server and UI (with hot reload)
pnpm dev:apps
```

## Development / Example Tools

`apps/devserver` and `apps/devui` are example apps used internally to test the SDK. They're open for reference and contributions, but **not production services**.

**Security Notes:**
- The devserver is configured for **local-only** use (CORS locked to localhost)
- No `.env` files or secrets should be committed
- These tools are for local development and testing only

## CLI Usage

```bash
# Install CLI globally
npm install -g langpatrol-cli

# Analyze a prompt file
langpatrol analyze prompt.txt

# Output JSON report
langpatrol analyze prompt.txt --json --out report.json
```

## Documentation

- [Quick Start Guide](./docs/QUICKSTART.md)
- [API Documentation](./packages/langpatrol/README.md)
- [License FAQ](./docs/LICENSE-FAQ.md)

## License

All packages are licensed under Elastic License 2.0.

See [LICENSE-FAQ.md](./docs/LICENSE-FAQ.md) for details.

