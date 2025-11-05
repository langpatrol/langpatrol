import fs from "fs";

const heads = [
  "Hello AI, please process this support log for {{customer_name}}.",
  "The following contains many user chats; continue the list and summarize previous results.",
  "Be concise yet also provide a detailed step by step explanation of each issue resolution.",
  "Return a strict JSON object but add commentary afterwards to justify the values.",
];

const bodyUnit = `
Customer: The refund for order {{order_id}} was delayed again.
Agent: We are sorry for the inconvenience. Please refer to the report above.
System: Extract key topics, but as discussed earlier, continue the analysis.

JSON Example:
{
  "ticketId": "{{ticket_id}}",
  "sentiment": "positive",
  "resolution": "pending"
}
After this JSON, add a natural language summary explaining what happened.
`;

function makeHugeBlob(units: number) {
  const chunks: string[] = [];
  for (let i = 0; i < units; i++) {
    chunks.push(bodyUnit.replace(/\{\{ticket_id\}\}/g, `TCK-${i}`));
  }
  return heads.join("\n") + "\n" + chunks.join("\n") + "\nEND.";
}

// 50 000 tokens ≈ 200 000 chars; adjust if needed
const hugePrompt = makeHugeBlob(600); // ≈ 50 k tokens

// Annotated version
const annotated = hugePrompt
  .replace(/{{[^}]+}}/g, (m) => `${m}[MISSING_PLACEHOLDER]`)
  .replace(/\b(as discussed|continue the list|previous results)\b/gi, (m) => `${m}[MISSING_REFERENCE]`)
  .replace(/\b(Be concise yet also provide a detailed step by step explanation)\b/gi, (m) => `${m}[CONFLICTING_INSTRUCTION]`)
  .replace(/\b(Return a strict JSON object but add commentary afterwards)\b/gi, (m) => `${m}[SCHEMA_RISK]`);

fs.writeFileSync("huge_prompt.txt", hugePrompt);
fs.writeFileSync("huge_prompt_annotated.txt", annotated);

console.log("Generated huge_prompt.txt and huge_prompt_annotated.txt");