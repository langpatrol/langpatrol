# 🧐 LangPatrol

**Pre-inference prompt validation and linting for LLMs**

[![NPM Version](https://img.shields.io/npm/v/langpatrol.svg)](https://www.npmjs.com/package/langpatrol)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Website](https://img.shields.io/badge/Website-langpatrol.com-blue)](https://www.langpatrol.com)

*Think of it as ESLint or Prettier, but for prompts sent to large language models.*

[Get Started](#-quick-start) • [Documentation](#-documentation) • [Feature Requests](http://langpatrol.com/feature-requests) • [Contact Us](#-get-in-touch)

</div>

---

## 🎯 What is LangPatrol?

LangPatrol is a comprehensive solution designed to enhance the quality and reliability of prompts used in Large Language Models (LLMs). Before your app sends a prompt to an LLM like gpt-5.1 or Claude, LangPatrol runs fast, local analysis to catch common prompt bugs that waste tokens or produce unreliable outputs.

**Key Benefits:**
- ⚡ **Fast local analysis** - Runs entirely in your environment
- 🐛 **Catches prompt bugs** - Detects issues before they reach the LLM
- 💰 **Saves tokens** - Prevents wasted API calls and costs
- 🎯 **Improves reliability** - Ensures consistent, high-quality outputs

---

## 🚀 Two Ways to Use LangPatrol

### 1️⃣ Free Open-Source SDK

The **LangPatrol SDK** is a free, open-source toolkit that provides powerful prompt validation and analysis capabilities. It runs entirely locally in your environment and detects common prompt issues including:

- **MISSING_PLACEHOLDER** - Unresolved template variables (e.g. `{{customer_name}}` not filled)
- **MISSING_REFERENCE** - Deictic references ("the report", "continue the list") with no prior content
- **CONFLICTING_INSTRUCTION** - Contradictory directives ("be concise" and "give a detailed explanation")
- **SCHEMA_RISK** - Prompts requesting JSON but also prose or commentary around it
- **TOKEN_OVERAGE** - Estimated token length exceeding model context or cost limits
- **INVALID_SCHEMA** - Invalid JSON Schema structure

[![npm package](https://img.shields.io/badge/npm-langpatrol-red)](https://www.npmjs.com/package/langpatrol)

### 2️⃣ Hosted Cloud Solution (Free Tier Available)

For advanced validation and prompt analysis, check out our **[hosted cloud solution](https://www.langpatrol.com)**. The cloud platform offers:

- 🤖 **AI-Powered Analysis** - Trained and distilled AI models for deeper prompt understanding
- 🔍 **Domain Context Checking** - Validate prompts against your specific domain/industry
- 📊 **Advanced Analytics** - Detailed insights and prompt optimization recommendations
- ⚡ **Prompt Optimization** - AI-powered prompt compression to reduce token usage
- 🚀 **Scalable Infrastructure** - Handle high-volume analysis with ease

**Get started for free** at [langpatrol.com](https://www.langpatrol.com) - no credit card required.

---

## ⚡ Quick Start

### Installation

```bash
npm install langpatrol
```

### Basic Usage

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Summarize the report.',
  model: 'gpt-5.1'
});

if (report.issues.length) {
  console.log('Issues found:', report.issues);
  // Handle issues before sending to LLM
}
```

### Using with Message History

```typescript
const report = await analyzePrompt({
  messages: [
    { role: 'user', content: 'Here is the sales report: Q3 revenue was $1M' },
    { role: 'user', content: 'Summarize the report.' }
  ],
  model: 'gpt-5.1'
});
```

### Using with JSON Schema

```typescript
const report = await analyzePrompt({
  prompt: 'Return user data as JSON.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' }
    },
    required: ['name', 'age']
  },
  model: 'gpt-5.1'
});
```

### Understanding Issue Codes

Each issue in the report includes a `code` field. Here's how to handle different issue types:

```typescript
const report = await analyzePrompt({
  prompt: 'Continue the list.',
  model: 'gpt-5.1'
});

// Check for specific issue types
const missingRef = report.issues.find(i => i.code === 'MISSING_REFERENCE');
if (missingRef) {
  console.warn('Missing reference detected:', missingRef.message);
  // Add context or handle the issue
}

const tokenOverage = report.issues.find(i => i.code === 'TOKEN_OVERAGE');
if (tokenOverage) {
  console.warn('Token limit exceeded:', tokenOverage.message);
  // Truncate or summarize the prompt
}

const placeholder = report.issues.find(i => i.code === 'MISSING_PLACEHOLDER');
if (placeholder) {
  console.warn('Unresolved placeholder:', placeholder.message);
  // Fill in template variables
}
```

---

## ☁️ Using the Cloud API

The cloud API provides advanced features like AI-powered analysis, domain context checking, and prompt optimization.

### Get Your API Key

1. Sign up at [langpatrol.com](https://www.langpatrol.com) (free tier available)
2. Navigate to your dashboard
3. Copy your API key from the settings page

### Basic Cloud API Usage

```typescript
import { analyzePrompt } from 'langpatrol';

const report = await analyzePrompt({
  prompt: 'Generate a marketing email for our SaaS product',
  model: 'gpt-5.1',
  options: {
    apiKey: process.env.LANGPATROL_API_KEY,
    apiBaseUrl: 'https://api.langpatrol.com' // Optional, defaults to production
  }
});
```

### Domain Context Checking (Cloud-only)

Validate that prompts match your domain activity:

```typescript
const report = await analyzePrompt({
  prompt: 'Generate a marketing email for our SaaS product',
  model: 'gpt-5.1',
  options: {
    apiKey: process.env.LANGPATROL_API_KEY,
    check_context: {
      domains: ['saas', 'marketing', 'email', 'software']
    }
  }
});

if (report.issues.find(i => i.code === 'OUT_OF_CONTEXT')) {
  console.warn('Prompt is out of context for your domain');
}
```

### Prompt Optimization (Cloud-only)

Compress prompts to reduce token usage:

```typescript
import { optimizePrompt } from 'langpatrol';

const optimized = await optimizePrompt({
  prompt: 'Write a detailed project proposal for building a new mobile app...',
  model: 'gpt-5.1',
  options: {
    apiKey: process.env.LANGPATROL_API_KEY
  }
});

console.log('Compression ratio:', optimized.ratio);
console.log('Tokens saved:', optimized.origin_tokens - optimized.optimized_tokens);
```

---

## 📚 Documentation

- **[Quick Start Guide](./docs/QUICKSTART.md)** - Get up and running in minutes
- **[API Documentation](./packages/langpatrol/README.md)** - Complete API reference
- **[License FAQ](./docs/LICENSE-FAQ.md)** - Licensing details and commercial use
- **[Project Overview](./docs/project-overview.md)** - Architecture and design decisions
- **[Development Guide](./docs/development.md)** - Contributing and development setup

### Issue Type Documentation

- [MISSING_PLACEHOLDER](./docs/rules/missing-placeholder.md)
- [MISSING_REFERENCE](./docs/rules/missing-reference.md)
- [CONFLICTING_INSTRUCTION](./docs/rules/conflicting-instruction.md)
- [SCHEMA_RISK](./docs/rules/schema-risk.md)
- [TOKEN_OVERAGE](./docs/rules/token-overage.md)

---

## 🛠️ Development

This is a pnpm workspace monorepo:

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

### Monorepo Structure

- `packages/engine` - Core analysis engine (MIT)
- `packages/langpatrol` - Public SDK (MIT)
- `packages/cli` - Command-line tool (MIT)
- `packages/rules` - Shared lexicons and patterns (MIT)
- `apps/devserver` - Express API for local testing (MIT)
- `apps/devui` - React/Vite UI for interactive testing (MIT)

**Note:** `apps/devserver` and `apps/devui` are example apps used internally for testing. They're open for reference and contributions, but not production services.

---

## 💬 Get in Touch

We're building LangPatrol in the open and would love to hear from you!

- 📧 **Founders Email**: [founders@langpatrol.com](mailto:founders@langpatrol.com)
-	⭐ **Let's connect on X** for updates and news: [x.com/langpatrol](https://x.com/langpatrol)
- 💡 **Feature Requests**: [langpatrol.com/feature-requests](http://langpatrol.com/feature-requests)
- 🌐 **Website**: [langpatrol.com](https://www.langpatrol.com)
- 📦 **NPM Package**: [npmjs.com/package/langpatrol](https://www.npmjs.com/package/langpatrol)

---

## 📄 License

The LangPatrol SDK is licensed under **MIT License**. It's free and open-source, available for any use including commercial purposes. See [LICENSE-FAQ.md](./docs/LICENSE-FAQ.md) for details.

---

<div align="center">

**Made with ❤️ by the LangPatrol team**

[Get Started](#-quick-start) • [Documentation](#-documentation) • [Contact Us](#-get-in-touch)