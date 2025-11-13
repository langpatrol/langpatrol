# LangPatrol Documentation

Welcome to the LangPatrol documentation. This guide provides comprehensive information about the project, its architecture, technical implementation, and usage.

## Table of Contents

### Getting Started
- [Project Overview](./project-overview.md) - What is LangPatrol and why it exists
- [Quick Start Guide](./QUICKSTART.md) - Get up and running in minutes
- [Installation](./project-overview.md#installation) - Installation instructions

### Architecture & Structure
- [Architecture Overview](./architecture.md) - System architecture and design principles
- [Monorepo Structure](./architecture.md#monorepo-structure) - Package organization and dependencies
- [Core Engine](./architecture.md#core-engine) - The analysis engine internals

### Detection Rules
LangPatrol detects five categories of prompt issues:

- [Missing Placeholder Detection](./rules/missing-placeholder.md) - Detects unresolved template variables
- [Missing Reference Detection](./rules/missing-reference.md) - Detects deictic references without antecedents
- [Conflicting Instruction Detection](./rules/conflicting-instruction.md) - Detects contradictory directives
- [Schema Risk Detection](./rules/schema-risk.md) - Detects JSON/prose conflicts
- [Token Overage Detection](./rules/token-overage.md) - Detects context window violations

### Technical Deep Dives
- [Semantic Analytics](./technical/semantic-analytics.md) - Embedding-based similarity detection
- [NLI Entailment](./technical/nli-entailment.md) - Natural Language Inference validation
- [Fulfillment Checking](./technical/fulfillment-checking.md) - How reference fulfillment works
- [Tokenization](./technical/tokenization.md) - Token estimation and counting
- [Model Integration](./technical/model-integration.md) - ML model usage and configuration

### API & Usage
- [API Reference](./api-reference.md) - Complete API documentation
- [Configuration Options](./api-reference.md#configuration) - All available options
- [Adapters](./api-reference.md#adapters) - Framework integrations (LangChain, Vercel AI SDK)

### Development
- [Development Guide](./development.md) - Setting up the development environment
- [Contributing](./CONTRIBUTING.md) - How to contribute to LangPatrol
- [Testing](./development.md#testing) - Running tests and test structure

### Additional Resources
- [License FAQ](./LICENSE-FAQ.md) - Licensing information
- [Changelog](./CHANGELOG.md) - Version history

## Quick Navigation

**New to LangPatrol?** Start with [Project Overview](./project-overview.md) and [Quick Start Guide](./QUICKSTART.md).

**Want to understand how it works?** Read [Architecture Overview](./architecture.md) and the [Technical Deep Dives](./technical/semantic-analytics.md).

**Need to use it?** Check out [API Reference](./api-reference.md) and [Configuration Options](./api-reference.md#configuration).

**Want to contribute?** See [Development Guide](./development.md) and [Contributing](./CONTRIBUTING.md).

