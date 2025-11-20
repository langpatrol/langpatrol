# Contributing to LangPatrol

We're building LangPatrol in the open and welcome contributions! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm 8+

### Setup

```bash
# Clone the repository
git clone https://github.com/langpatrol/langpatrol.git
cd langpatrol

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Development Workflow

### Monorepo Structure

This is a pnpm workspace monorepo:

- `packages/engine` - Core analysis engine (Elastic License 2.0)
- `packages/langpatrol` - Public SDK (MIT)
- `packages/cli` - Command-line tool (MIT)
- `packages/rules` - Shared lexicons and patterns (MIT)
- `apps/devserver` - Express API for local testing
- `apps/devui` - React/Vite UI for interactive testing

### Development Commands

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Format code
pnpm format

# Start dev server and UI (for testing)
pnpm dev:apps

# Build a specific package
pnpm --filter @langpatrol/engine build

# Run tests for a specific package
pnpm --filter @langpatrol/engine test
```

## Code Style

- **TypeScript**: All code is written in TypeScript
- **Formatting**: Prettier is configured (run `pnpm format`)
- **Linting**: ESLint is configured (run `pnpm lint`)
- **Testing**: Vitest for unit tests

### Code Guidelines

- Write minimal, focused code
- Add unit tests for new rules or features
- Follow existing patterns in the codebase
- Keep functions pure and testable
- Document complex logic

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm --filter @langpatrol/engine test --watch

# Specific test file
pnpm --filter @langpatrol/engine test tokens.test.ts
```

### Writing Tests

- Add tests in `*.test.ts` files alongside source files
- Use Vitest assertions
- Test edge cases and error conditions
- Keep tests fast and deterministic

## Submitting Changes

### Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**:
   - Write code
   - Add tests
   - Update documentation if needed
   - Run `pnpm lint` and `pnpm format`
4. **Test your changes**:
   ```bash
   pnpm build
   pnpm test
   ```
5. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add new rule for X"
   ```
6. **Push** and open a Pull Request

### Commit Message Format

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements

## Areas for Contribution

### High Priority

- **New rules**: Detect additional prompt issues
- **Performance**: Optimize rule execution speed
- **Testing**: Expand test coverage, especially edge cases
- **Documentation**: Improve examples and guides

### Rule Development

Rules detect prompt issues locally without external API calls. When adding a new rule:

1. Add the rule code in `packages/engine/src/rules/`
2. Export it from `packages/engine/src/analyze.ts`
3. Add tests in `packages/engine/src/rules/*.test.ts`
4. Update types in `packages/engine/src/types.ts` if needed
5. Document the rule in the README

### Performance

- Keep rules fast (<50ms p50 for typical prompts)
- Use early returns and bailouts
- Avoid expensive operations (tokenization unless needed)
- Profile with `ruleTimings` in the report

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Be patient — we're iterating fast and may have rough edges

## License

By contributing, you agree that your contributions will be licensed under the same license as the package you're modifying:
- `@langpatrol/engine`: Elastic License 2.0
- All other packages: MIT

See [LICENSE-FAQ.md](./docs/LICENSE-FAQ.md) for details.

