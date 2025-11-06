// generate-huge-prompt.ts
// Synthetic prompt generator for LangPatrol SDK testing.
// Produces a massive, varied .txt that intentionally includes patterns
// for: MISSING_PLACEHOLDER, MISSING_REFERENCE, CONFLICTING_INSTRUCTION,
// SCHEMA_RISK, TOKEN_OVERAGE.
//
// Usage:
//   pnpm tsx generate-huge-prompt.ts --tokens 50000 --outdir .
// Options:
//   --tokens <n>   approximate target tokens (default 50000)
//   --outdir <p>   output directory (default ".")
//   --seed <s>     optional numeric seed for reproducibility
//
// Notes:
// - Token estimate uses a rough heuristic (~4 chars/token).
// - We vary phrasing, languages, and structures to avoid boring repetition.

import fs from "fs";
import path from "path";
import crypto from "crypto";

// ------------------------- CLI & Utils -------------------------

type Args = {
  tokens: number;
  outdir: string;
  seed?: number;
};

function parseArgs(argv: string[]): Args {
  let tokens = 50000;
  let outdir = ".";
  let seed: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tokens" && argv[i + 1]) {
      tokens = Math.max(1000, Number(argv[++i]) || 50000);
    } else if (argv[i] === "--outdir" && argv[i + 1]) {
      outdir = argv[++i];
    } else if (argv[i] === "--seed" && argv[i + 1]) {
      seed = Number(argv[++i]);
    }
  }
  return { tokens, outdir, seed };
}

// Small seeded PRNG (xorshift32 style)
function makeRng(seed = Date.now() >>> 0) {
  let x = seed || 123456789;
  return () => {
    // xorshift
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Map to [0,1)
    return ((x >>> 0) / 0xffffffff);
  };
}

function choice<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Approximate tokens: OpenAI-ish rule of thumb (~4 chars/token)
function estimateTokensFromText(s: string): number {
  return Math.ceil(s.length / 4);
}

// Unique-ish readable ID
function humanId(n: number) {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  return (
    alpha[n % alpha.length] +
    alpha[(n * 7) % alpha.length] +
    "-" +
    digits[n % digits.length] +
    digits[(n * 11) % digits.length]
  );
}

// ------------------------- Content Pools -------------------------

const conflictDirectives = [
  // CONTRADICTIONS
  "Be concise yet also provide a detailed step by step explanation of each issue resolution.",
  "Respond in one sentence but also deliver an exhaustive tutorial with multiple examples.",
  "Keep answers minimal; meanwhile, expand extensively on every nuance with citations and footnotes.",
  "Only summarize briefly; however, craft a long-form deep dive with exhaustive bullet points.",
];

const schemaRiskDirectives = [
  // JSON-only vs commentary conflict
  "Return a strict JSON object but add commentary afterwards to justify the values.",
  "Output only valid JSON; then include a friendly narrative reasoning below it.",
  "Respond with JSON adhering to the schema; additionally, provide a paragraph of analysis after the JSON.",
  "Give machine-readable JSON exclusively and also append a human-readable explanation.",
];

const missingReferencePhrases = [
  "as discussed earlier",
  "continue the list",
  "previous results",
  "the report above",
  "the steps below",
  "the earlier transcript",
  "that prior attachment",
  "the aforementioned note",
];

const placeholderVars = [
  "{{customer_name}}",
  "{{order_id}}",
  "{{ticket_id}}",
  "{{region}}",
  "{{agent_name}}",
  "{{due_date}}",
  "{{account_id}}",
  "{{plan_tier}}",
];

const languages = [
  "English", "Deutsch", "Español", "Français", "Português", "日本語", "한국어", "中文", "Italiano", "Nederlands",
];

const miniPrompts = [
  "Hello AI, please process this support log for {{customer_name}}.",
  "The following contains many user chats; continue the list and summarize previous results.",
  "Please review the steps below and compare them to the report above.",
  "We need a final summary for {{account_id}} in the {{region}} region.",
  "As discussed earlier, ensure you do not exceed the budget.",
  "Be concise yet also provide a detailed step by step explanation of each issue resolution.",
  "Return a strict JSON object but add commentary afterwards to justify the values.",
];

const userUtterances = [
  "Customer: The refund for order {{order_id}} was delayed again.",
  "Customer: I can't log in with SSO; the error references a missing assertion.",
  "Customer: The webhook failed intermittently after we rotated the API key.",
  "Customer: Multi-tenant isolation looks broken for two projects in {{region}}.",
  "Customer: Why was my plan changed from {{plan_tier}} without notice?",
];

const agentUtterances = [
  "Agent: We are sorry for the inconvenience. Please refer to the report above.",
  "Agent: Noted. As discussed earlier, we can attempt a retry policy change.",
  "Agent: Let me escalate this and continue the analysis.",
  "Agent: I will follow the steps below and revert.",
  "Agent: Could you attach the logs you mentioned in the earlier transcript?",
];

const systemDirectives = [
  "System: Extract key topics, but as discussed earlier, continue the analysis.",
  "System: Summarize the conversation so far and continue the list in chronological order.",
  "System: Prioritize P1 issues; for everything else, reference the previous results.",
  "System: Cross-check the report above with the steps below.",
];

const tinyCodeSnippets = [
  `\`\`\`bash
curl -H "Authorization: Bearer {{api_token}}" https://api.example.com/tickets/{{ticket_id}}
\`\`\``,
  `\`\`\`json
{ "id": "{{ticket_id}}", "priority": "high", "owner": "{{agent_name}}" }
\`\`\``,
  `\`\`\`ts
type Ticket = { id: string; status: "open"|"closed"; assignee?: string; };
const id = "{{ticket_id}}";
\`\`\``,
];

const jsonSchemas = [
  {
    name: "TicketSummary",
    schema: `{
  "ticketId": "{{ticket_id}}",
  "sentiment": "positive",
  "resolution": "pending",
  "owner": "{{agent_name}}",
  "notes": "See the report above."
}`,
  },
  {
    name: "BillingCase",
    schema: `{
  "caseId": "{{order_id}}",
  "impact": "moderate",
  "refundEligible": true,
  "country": "{{region}}"
}`,
  },
  {
    name: "AuthIncident",
    schema: `{
  "incidentId": "{{ticket_id}}",
  "rootCause": "SSO misconfiguration",
  "customer": "{{customer_name}}",
  "requiresFollowUp": true
}`,
  },
];

const stylisticFlourishes = [
  "🧭 Context unclear; see the aforementioned note.",
  "⚠️ Budget risk: the previous results suggest we may exceed limits.",
  "🧪 Hypothesis pending validation; continue the list of experiments.",
  "📌 Action items are in the steps below.",
  "🔒 Security hint: rotate tokens as discussed earlier.",
];

const multilingualClosers = [
  "Please finalize a concise overview. / Por favor, finalice un resumen conciso. / Bitte eine kurze Übersicht.",
  "Provide a succinct brief, then elaborate thoroughly. / Résumez brièvement, puis développez.",
  "Nur JSON zurückgeben, aber fügen Sie anschließend einen Kommentar hinzu.",
  "Devuelva solo JSON; luego agregue un comentario con el razonamiento.",
];

// Lines that deliberately hint at token budgets (to pair with size for TOKEN_OVERAGE)
const overageBaits = [
  "Note: do not exceed 4,096 tokens, but the prior transcript is extremely long.",
  "Warning: context window is limited; however, include every detail mentioned so far.",
  "Budget: stay under 8k tokens; nonetheless, reproduce the entire conversation.",
];

// ------------------------- Generation -------------------------

function makeUnit(rng: () => number, idx: number): string {
  const id = humanId(idx);
  const lang = choice(rng, languages);
  const head = [
    `### UNIT ${id} — Locale: ${lang}`,
    choice(rng, miniPrompts),
    choice(rng, conflictDirectives),
    choice(rng, schemaRiskDirectives),
    choice(rng, overageBaits),
  ].join("\n");

  const convo = [
    choice(rng, userUtterances),
    choice(rng, agentUtterances),
    choice(rng, systemDirectives),
  ].join("\n");

  const jsonBlock = choice(rng, jsonSchemas).schema;

  // Randomly decide to partially resolve some placeholders to avoid pure repetition
  let resolved = [convo, jsonBlock, choice(rng, tinyCodeSnippets)].join("\n\n");
  const fills: Record<string, string> = {
    "{{ticket_id}}": `TCK-${idx}-${Math.floor(rng() * 10000)}`,
    "{{order_id}}": `ORD-${(idx * 13) % 999999}`,
    "{{customer_name}}": `Customer-${humanId(idx)}`,
    "{{region}}": choice(rng, ["us-east-1", "eu-central-1", "ap-south-1"]),
    "{{agent_name}}": choice(rng, ["J.Doe", "A.Smith", "K.Lee", "M.García"]),
    "{{due_date}}": `2025-12-${String((idx % 28) + 1).padStart(2, "0")}`,
    "{{plan_tier}}": choice(rng, ["Free", "Pro", "Enterprise"]),
    "{{api_token}}": crypto.randomBytes(4).toString("hex"),
  };

  // Replace ~50% of placeholders to keep some truly missing
  for (const key of Object.keys(fills)) {
    if (rng() < 0.5) {
      const re = new RegExp(key.replace(/[{}]/g, "\\$&"), "g");
      resolved = resolved.replace(re, fills[key]);
    }
  }

  // Add missing reference phrases variably
  const refs = shuffle(rng, missingReferencePhrases).slice(0, 3).join(", ");

  const tail = [
    "JSON Example:",
    resolved,
    "After this JSON, add a natural language summary explaining what happened.",
    choice(rng, stylisticFlourishes),
    `Deictic references included: ${refs}.`,
    choice(rng, multilingualClosers),
    "-----",
  ].join("\n");

  return [head, tail].join("\n\n");
}

function annotateIssues(s: string): string {
  return s
    // MISSING_PLACEHOLDER
    .replace(/{{[^}]+}}/g, (m) => `${m}[MISSING_PLACEHOLDER]`)
    // MISSING_REFERENCE
    .replace(
      /\b(as discussed earlier|continue the list|previous results|the report above|the steps below|the earlier transcript|that prior attachment|the aforementioned note)\b/gi,
      (m) => `${m}[MISSING_REFERENCE]`
    )
    // CONFLICTING_INSTRUCTION
    .replace(
      /\b(Be concise yet also provide a detailed step by step explanation|Respond in one sentence but also deliver an exhaustive tutorial|Keep answers minimal; meanwhile, expand extensively|Only summarize briefly; however, craft a long-form deep dive)\b/gi,
      (m) => `${m}[CONFLICTING_INSTRUCTION]`
    )
    // SCHEMA_RISK
    .replace(
      /\b(Return a strict JSON object but add commentary afterwards|Output only valid JSON; then include a friendly narrative|Respond with JSON adhering to the schema; additionally, provide a paragraph|Give machine-readable JSON exclusively and also append a human-readable explanation)\b/gi,
      (m) => `${m}[SCHEMA_RISK]`
    )
    // TOKEN_OVERAGE (we mark explicit budget lines; true overage is due to size)
    .replace(
      /\b(do not exceed 4,096 tokens|context window is limited; however, include every detail|stay under 8k tokens; nonetheless, reproduce the entire conversation)\b/gi,
      (m) => `${m}[TOKEN_OVERAGE]`
    );
}

// ------------------------- Main -------------------------

(async () => {
  const { tokens: targetTokens, outdir, seed } = parseArgs(process.argv.slice(2));
  const rng = makeRng(seed ?? Date.now());

  const header = [
    "# Synthetic Prompt Corpus",
    "Purpose: trigger LangPatrol issue detectors while varying content.",
    "Detectors: MISSING_PLACEHOLDER, MISSING_REFERENCE, CONFLICTING_INSTRUCTION, SCHEMA_RISK, TOKEN_OVERAGE.",
    "Note: This file is intentionally large and includes mixed languages, code, JSON, and deictic phrases.",
    "",
  ].join("\n");

  let chunks: string[] = [header];
  let est = estimateTokensFromText(header);
  let i = 0;

  // Grow until we exceed the target estimate
  while (est < targetTokens) {
    const unit = makeUnit(rng, i++);
    chunks.push(unit);
    est = estimateTokensFromText(chunks.join("\n"));
    // Safety break in the absurdly unlikely event of non-growth
    if (i > 200000) break;
  }

  // Add a terminating block that reasserts contradictions and schema risk
  const footer = [
    "### END BLOCK",
    choice(rng, conflictDirectives),
    choice(rng, schemaRiskDirectives),
    choice(rng, overageBaits),
    "END.",
    "",
  ].join("\n");

  chunks.push(footer);
  const hugePrompt = chunks.join("\n");
  const annotated = annotateIssues(hugePrompt);

  // Ensure output dir
  fs.mkdirSync(outdir, { recursive: true });
  const rawPath = path.join(outdir, "20k_tokens_prompt.txt");
  const annPath = path.join(outdir, "20k_tokens_prompt_annotated.txt");
  const statsPath = path.join(outdir, "20k_tokens_prompt_stats.json");

  fs.writeFileSync(rawPath, hugePrompt, "utf8");
  fs.writeFileSync(annPath, annotated, "utf8");

  const stats = {
    targetTokens,
    estimatedTokensRaw: estimateTokensFromText(hugePrompt),
    estimatedTokensAnnotated: estimateTokensFromText(annotated),
    units: i,
    bytesRaw: Buffer.byteLength(hugePrompt, "utf8"),
    bytesAnnotated: Buffer.byteLength(annotated, "utf8"),
    seedUsed: seed ?? null,
    generatedAtISO: new Date().toISOString(),
  };
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf8");

  console.log(`Generated:
- ${rawPath}
- ${annPath}
- ${statsPath}
≈${stats.estimatedTokensRaw} tokens (raw), ${i} units.`);
})();