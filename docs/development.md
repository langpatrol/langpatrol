# Development Guide

## Overview

This guide helps you set up and contribute to LangPatrol development.

## Prerequisites

- **Node.js** 18+ and npm/pnpm
- **pnpm** 9.0.0+ (package manager)
- **TypeScript** 5.6.0+
- **Git**

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/langpatrol.git
cd langpatrol
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build All Packages

```bash
pnpm build
```

### 4. Run Tests

```bash
pnpm test
```

## Project Structure

```
langpatrol/
├── packages/
│   ├── engine/          # Core analysis engine
│   ├── langpatrol/      # Public SDK
│   ├── cli/             # Command-line tool
│   └── rules/           # Shared lexicons and patterns
├── apps/
│   ├── devserver/       # Express API for testing
│   └── devui/           # React/Vite UI for interactive testing
├── tooling/             # Shared tooling configs
└── docs/                # Documentation
```

## Development Workflow

### Running in Development Mode

Start all packages in watch mode:

```bash
pnpm dev
```

Start only apps (with dependencies):

```bash
pnpm dev:apps
```

### Building

Build all packages:

```bash
pnpm build
```

Build a specific package:

```bash
pnpm --filter @langpatrol/engine build
pnpm --filter langpatrol build
```

### Testing

Run all tests:

```bash
pnpm test
```

Run tests for a specific package:

```bash
pnpm --filter @langpatrol/engine test
```

Run tests in watch mode:

```bash
pnpm --filter @langpatrol/engine test --watch
```

### Linting

Lint all packages:

```bash
pnpm lint
```

Lint a specific package:

```bash
pnpm --filter @langpatrol/engine lint
```

### Formatting

Format all packages:

```bash
pnpm format
```

## Package Development

### Adding a New Rule

1. Create rule file in `packages/engine/src/rules/myrule.ts`:

```typescript
import type { AnalyzeInput, Report } from '../types';
import { createIssueId } from '../util/reporting';

export function run(input: AnalyzeInput, acc: Report): void {
  // Your detection logic
  if (detected) {
    acc.issues.push({
      id: createIssueId(),
      code: 'MY_NEW_ISSUE',
      severity: 'medium',
      detail: 'Issue description',
      // ...
    });
  }
}
```

2. Add to `packages/engine/src/analyze.ts`:

```typescript
import { run as runMyRule } from './rules/myrule';

// In analyze() function:
if (!disabledRules.has('MY_NEW_ISSUE')) {
  runMyRule(input, report);
}
```

3. Add to `packages/engine/src/types.ts`:

```typescript
export type IssueCode = 
  | 'MISSING_PLACEHOLDER'
  | 'MISSING_REFERENCE'
  | 'CONFLICTING_INSTRUCTION'
  | 'SCHEMA_RISK'
  | 'TOKEN_OVERAGE'
  | 'MY_NEW_ISSUE';  // Add here
```

4. Write tests in `packages/engine/src/rules/myrule.test.ts`

5. Update documentation in `docs/rules/my-new-rule.md`

### Adding a New Utility

1. Create utility file in `packages/engine/src/util/myutil.ts`:

```typescript
export function myUtilityFunction(input: string): string {
  // Your utility logic
  return result;
}
```

2. Export from `packages/engine/src/index.ts` if needed:

```typescript
export { myUtilityFunction } from './util/myutil';
```

3. Write tests in `packages/engine/src/util/myutil.test.ts`

### Adding a New Adapter

1. Create adapter file in `packages/langpatrol/src/adapters/myframework.ts`:

```typescript
import { analyzePrompt } from '../analyzePrompt';

export async function guardedCall(messages: any[], model: string) {
  const report = await analyzePrompt({ messages, model });
  
  if (report.issues.length > 0) {
    throw new Error('Invalid prompt detected');
  }
  
  // Call framework API
  return await frameworkAPI(messages, model);
}
```

2. Export from `packages/langpatrol/src/index.ts`:

```typescript
export { guardedCall } from './adapters/myframework';
```

## Testing

### Test Structure

Tests are located alongside source files:

```
packages/engine/src/
├── rules/
│   ├── placeholders.ts
│   └── placeholders.test.ts
└── util/
    ├── tokenize.ts
    └── tokenize.test.ts
```

### Writing Tests

Use Vitest for testing:

```typescript
import { describe, it, expect } from 'vitest';
import { run } from './myrule';
import type { AnalyzeInput, Report } from '../types';

describe('myrule', () => {
  it('should detect issue', () => {
    const input: AnalyzeInput = {
      prompt: 'Test prompt'
    };
    const report: Report = { issues: [], suggestions: [] };

    run(input, report);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe('MY_NEW_ISSUE');
  });
});
```

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @langpatrol/engine test

# Watch mode
pnpm --filter @langpatrol/engine test --watch

# Coverage
pnpm --filter @langpatrol/engine test --coverage
```

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer type inference where possible
- Use interfaces for object shapes
- Use types for unions and intersections

### Formatting

Code is formatted with Prettier:

```bash
pnpm format
```

### Linting

Code is linted with ESLint:

```bash
pnpm lint
```

## Debugging

### Using Dev Tools

The dev UI (`apps/devui`) provides interactive testing:

```bash
pnpm dev:apps
# Open http://localhost:5173
```

### Using Dev Server

The dev server (`apps/devserver`) provides an API endpoint:

```bash
pnpm dev:apps
# API available at http://localhost:3000
```

### Debugging Tests

Use VS Code debugger or Node.js inspector:

```bash
node --inspect-brk node_modules/.bin/vitest
```

## Release Process

### Versioning

LangPatrol uses [Changesets](https://github.com/changesets/changesets) for versioning:

1. Create a changeset:

```bash
pnpm changeset
```

2. Update versions:

```bash
pnpm changeset version
```

3. Build and publish:

```bash
pnpm build
pnpm release
```

### Publishing

Publishing is handled by Changesets:

```bash
pnpm release
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## Troubleshooting

### Build Issues

**Issue:** TypeScript errors

**Solution:**
```bash
pnpm build --force
```

**Issue:** Missing dependencies

**Solution:**
```bash
pnpm install
```

### Test Issues

**Issue:** Tests failing

**Solution:**
```bash
# Clear cache
rm -rf node_modules/.cache

# Reinstall
pnpm install

# Rebuild
pnpm build
```

### Development Server Issues

**Issue:** Port already in use

**Solution:**
Change port in `apps/devserver/src/index.ts` or `apps/devui/vite.config.ts`

## Next Steps

- [Contributing Guide](../CONTRIBUTING.md) - Contribution guidelines
- [Architecture Overview](./architecture.md) - System design
- [API Reference](./api-reference.md) - Complete API documentation

