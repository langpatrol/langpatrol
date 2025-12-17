# LangPatrol Examples

This folder contains example scripts demonstrating how to use LangPatrol SDK features.

## Setup

1. **Build the langpatrol package** (if not already built):
   ```bash
   cd ../../packages/langpatrol
   npm run build
   # or
   pnpm build
   ```

2. **Install dependencies:**
   ```bash
   cd ../../apps/examples
   npm install
   # or
   pnpm install
   ```

3. **Create a `.env` file:**
   ```bash
   cp .env.example .env
   ```

4. **Add your API key to `.env`:**
   ```env
   LANGPATROL_API_KEY=your_api_key_here
   ```

## Examples

### enhance-prompt-example.js

Demonstrates the `enhancePrompt` function with various configurations:

- **Example 1**: Basic PII detection and redaction
- **Example 2**: Security threat detection and removal
- **Example 3**: Full enhancement (PII + Security + Compression)
- **Example 4**: Using callback style instead of promises
- **Example 5**: Error handling for OUT_OF_CONTEXT errors

### Running the Example

```bash
npm run example
# or
node enhance-prompt-example.js
```

## Configuration

The examples use environment variables from `.env`:

- `LANGPATROL_API_KEY` (required): Your LangPatrol API key
- `LANGPATROL_API_BASE_URL` (optional): Custom API base URL (defaults to `https://api.langpatrol.com`)

## Features Demonstrated

### PII Detection and Redaction
Automatically detects and redacts personally identifiable information:
- Email addresses
- Phone numbers
- Names
- Addresses
- Credit card numbers
- SSN/National IDs

### Security Threat Removal
Detects and removes prompt injection attempts:
- Instructions to ignore previous commands
- Jailbreak attempts
- Data exfiltration attempts
- Malicious code generation requests

### Prompt Compression
Optimizes prompts to reduce token usage while preserving meaning.

## Usage Patterns

### Promise-based (async/await)
```javascript
const result = await enhancePrompt(prompt, {
  enablePIIDetection: true,
  apiKey: API_KEY,
});
```

### Callback-based
```javascript
enhancePrompt(
  prompt,
  { enablePIIDetection: true, apiKey: API_KEY },
  (result) => {
    console.log('Success:', result.optimizedPrompt);
  },
  (error) => {
    console.error('Error:', error.error);
  }
);
```

