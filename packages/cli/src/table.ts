import pc from 'picocolors';
import type { Report } from 'langpatrol';

const severityColors = {
  low: pc.yellow,
  medium: pc.orange,
  high: pc.red
};

export function printTable(report: Report): void {
  if (report.issues.length === 0) {
    console.log(pc.green('✓ No issues found'));
    return;
  }

  console.log('\nIssues:');
  for (const issue of report.issues) {
    const color = severityColors[issue.severity];
    console.log(
      `  ${color(issue.severity.toUpperCase())} ${pc.bold(issue.code)}: ${issue.detail}`
    );
    if (issue.evidence && issue.evidence.length > 0) {
      console.log(`    Evidence: ${issue.evidence.join(', ')}`);
    }
  }

  if (report.suggestions.length > 0) {
    console.log('\nSuggestions:');
    for (const suggestion of report.suggestions) {
      console.log(`  • ${suggestion.text}`);
    }
  }

  if (report.cost) {
    console.log(`\nEstimated tokens: ${report.cost.estInputTokens}`);
    if (report.cost.estUSD) {
      console.log(`Estimated cost: $${report.cost.estUSD.toFixed(4)}`);
    }
  }
}

