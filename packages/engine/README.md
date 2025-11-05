# @langpatrol/engine

Local prompt validation engine for LangPatrol.

## License

Elastic License 2.0 - See LICENSE-ELV2

## Usage

```typescript
import { analyze } from '@langpatrol/engine';

const report = analyze({
  prompt: 'Summarize the report.',
  model: 'gpt-5'
});

console.log(report.issues);
```

