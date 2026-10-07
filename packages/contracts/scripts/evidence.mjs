// Write EVIDENCE.md: every transaction of the demo, read back FROM THE CHAIN.
//
//   pnpm evidence:contract     # the deployment and its demo -> EVIDENCE.md
//   pnpm evidence:activity     # the second round -> EVIDENCE-ACTIVITY.md
//   node scripts/evidence.mjs <record.json> <EVIDENCE.md> <Name>   # any record
//
// deployments/studionet.json says what the scripts did. This file does not
// trust it: for every recorded hash it asks the node for the transaction and
// takes the sender, the status and the leader's result from the answer. The
// wallet table is built from those senders, so "who sent what" is the chain's
// statement, and a row whose on-chain outcome disagrees with the record is
// marked, never smoothed over.
//
// Self-contained on purpose (genlayer-js only), so the same script renders the
// evidence for any of the contracts' records.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const recordFile = path.resolve(process.argv[2] ?? path.join(ROOT, "deployments", "studionet.json"));
const outFile = path.resolve(process.argv[3] ?? path.join(ROOT, "..", "..", "EVIDENCE.md"));
const name = process.argv[4] ?? JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).displayName ?? "Contract";
const EXPLORER = "https://explorer-studio.genlayer.com";

const record = JSON.parse(readFileSync(recordFile, "utf8"));
const client = createClient({ chain: studionet });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tx(hash) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.getTransaction({ hash });
    } catch (e) {
      if (attempt >= 6) throw e;
      await sleep(8000);
    }
  }
}

function leaderResult(t) {
  const result = t?.consensus_data?.leader_receipt?.[0]?.result ?? {};
  const kind = String(result.status ?? "").toLowerCase();
  const payload = typeof result.payload === "string" ? result.payload : "";
  return { executed: kind === "return", refusal: kind === "return" ? "" : payload.replace(/^\[[A-Z_]+\]\s*/, "") };
}

const roles = new Map();
const addRole = (role, addr) => { if (addr && !roles.has(addr.toLowerCase())) roles.set(addr.toLowerCase(), role); };
addRole("deployer", record.deployer);
for (const [role, addr] of Object.entries(record.accounts ?? {})) addRole(role, addr);

const short = (h) => `${h.slice(0, 10)}…${h.slice(-4)}`;
const addrLink = (a) => `[\`${a}\`](${EXPLORER}/address/${a})`;
const txLink = (h) => `[\`${short(h)}\`](${EXPLORER}/tx/${h})`;
const cell = (s) => String(s).replace(/\|/g, "/").replace(/\n/g, " ");

const rows = [];
const sent = new Map();
let mismatches = 0;
for (const [i, s] of record.steps.entries()) {
  const t = await tx(s.tx);
  const from = String(t.from_address ?? t.sender ?? "");
  if (s.step === "deploy") addRole("deployer", from);
  const role = roles.get(from.toLowerCase()) ?? "unlisted";
  const out = leaderResult(t);
  const status = `${t.statusName ?? t.status}${t.result_name ? ` · ${t.result_name}` : ""}`;
  const agrees = s.step === "deploy" ? out.executed : out.executed === Boolean(s.ok);
  if (!agrees) mismatches++;
  sent.set(from.toLowerCase(), { from, n: (sent.get(from.toLowerCase())?.n ?? 0) + 1 });
  rows.push(`| ${i} | ${cell(s.step)} | ${role} [\`${from.slice(0, 6)}…${from.slice(-4)}\`](${EXPLORER}/address/${from}) | \`${s.method ?? "deploy"}\` | ${status} | ${
    out.executed ? "executed" : `refused: ${cell(out.refusal)}`}${agrees ? "" : " **(record disagrees)**"} | ${txLink(s.tx)} |`);
  process.stdout.write(".");
}
console.log("");

const wallets = [...sent.values()].map(({ from, n }) => `| ${roles.get(from.toLowerCase()) ?? "unlisted"} | ${addrLink(from)} | ${n} |`);
const deploy = record.steps.find((s) => s.step === "deploy");
const md = `# Evidence: ${name} on GenLayer StudioNet

Every row below was read back from the chain by \`scripts/evidence.mjs\`: the
sender, the status and the outcome come from the node's answer for each hash,
not from the deployment record. ${mismatches === 0 ? "Every outcome on chain matches the record." : `**${mismatches} row(s) disagree with the record.**`}

- **Contract:** ${addrLink(record.contract)}
${deploy ? `- **Deploy transaction:** ${txLink(deploy.tx)}` : "- **Round:** new wallets on the contract already deployed; no deploy in this round"}
${record.source_sha256 ? `- **Source sha256:** \`${record.source_sha256}\`` : `- **The deployment itself:** [EVIDENCE.md](EVIDENCE.md)`}
- **Transactions:** ${record.steps.length}, from ${sent.size} different wallets
- **Generated:** ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC

## Wallets

Each wallet was made in memory for this run, and its key was never written
anywhere. Click an address to see every transaction it sent.

| Role | Address | Transactions sent |
|---|---|---|
${wallets.join("\n")}

## Transactions, in order

"refused" is a transaction the contract was meant to refuse: the committee
agreed on the refusal, and the sentence is the contract's own.

| # | Step | Sent by | Method | On chain | Outcome | Tx |
|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
writeFileSync(outFile, md);
console.log(`${path.basename(outFile)} written: ${record.steps.length} transactions, ${sent.size} wallets, ${mismatches} mismatch(es)`);
process.exit(mismatches === 0 ? 0 : 1);
