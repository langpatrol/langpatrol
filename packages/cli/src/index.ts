#!/usr/bin/env node
import { analyzePrompt, type AnalyzeInput } from 'langpatrol';
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'glob';
import pc from 'picocolors';
import { printTable } from './table.js';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: langpatrol analyze <pathGlob> [options]

Options:
  --json              Output JSON report
  --out <file>        Write JSON report to file
  --model <model>     Model to use for token estimation (default: gpt-4o)
`);
  process.exit(0);
}

(async () => {
if (args[0] === 'analyze') {
  const pathGlob = args[1];
  const jsonOutput = args.includes('--json');
  const outIndex = args.indexOf('--out');
  const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
  const modelIndex = args.indexOf('--model');
  const model = modelIndex >= 0 ? args[modelIndex + 1] : 'gpt-4o';

  if (!pathGlob) {
    console.error(pc.red('Error: pathGlob required'));
    process.exit(1);
  }

  const files = globSync(pathGlob);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reports: Array<{ file: string; report: any }> = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      let input: AnalyzeInput;

      try {
        const parsed = JSON.parse(content);
        input = {
          prompt: parsed.prompt,
          messages: parsed.messages,
          schema: parsed.schema,
          model
        };
      } catch {
        input = { prompt: content, model };
      }

      const report = await analyzePrompt(input);
      reports.push({ file, report });

      if (!jsonOutput) {
        console.log(pc.bold(`\n${file}:`));
        printTable(report);
      }
    } catch (error) {
      console.error(pc.red(`Error processing ${file}:`), error);
    }
  }

  if (jsonOutput || outFile) {
    const json = JSON.stringify(reports, null, 2);
    if (outFile) {
      writeFileSync(outFile, json, 'utf-8');
      console.log(pc.green(`Report written to ${outFile}`));
    } else {
      console.log(json);
    }
  }
} else {
  console.error(pc.red(`Unknown command: ${args[0]}`));
  process.exit(1);
}
})();

