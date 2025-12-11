# @langpatrol/engine

Local prompt validation engine for LangPatrol.

## License

MIT License

## Usage

```typescript
import { analyze } from '@langpatrol/engine';

const report = analyze({
  prompt: 'Summarize the report.',
  model: 'gpt-5'
});

console.log(report.issues);
```

