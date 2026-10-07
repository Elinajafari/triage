// Check the live deployment against the record, from the chain, read only.
//
//   pnpm e2e:contract
//
// deployments/studionet.json says what the demo did. This asks the chain
// again, with no key: every transaction's receipt must still say what the
// record says (executed, or refused with the same sentence), and the desk,
// its categories and every complaint must read back as recorded. Every demo
// complaint is closed (answered, breached or out of scope), so nothing on
// them can change; the desk stays open, so counts that can only grow are
// checked to be at least what was recorded. It prints PASS or FAIL per check
// and exits non-zero on any FAIL, so a record that drifted from the chain
// cannot sit in the repo looking verified.

import { readFileSync } from "node:fs";
import { RECORD_FILE, clientFor, loadEnv, network, outcome, readRetry, sourceSha256 } from "./lib.mjs";

loadEnv();
const net = network();
const record = JSON.parse(readFileSync(RECORD_FILE, "utf8"));
const client = clientFor(net, null);
const address = record.contract;

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `\n      ${detail}` : ""}`);
}
const view = (functionName, args = []) => readRetry(() => client.readContract({ address, functionName, args }));
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? Number(x) : x instanceof Map ? Object.fromEntries(x) : x)));
const sorted = (o) => (Array.isArray(o) ? o.map(sorted) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sorted(o[k])])) : o);
const same = (a, b) => JSON.stringify(sorted(plain(a))) === JSON.stringify(sorted(plain(b)));

console.log(`\n${record.network} contract ${address}\n`);
check("the recorded source is the file in this repo", record.source_sha256 === sourceSha256());

for (const s of record.steps) {
  const receipt = await readRetry(() => client.getTransaction({ hash: s.tx }));
  const out = outcome(receipt);
  const good = s.ok ? out.ok : !out.ok && out.refusal === s.refusal;
  check(`tx ${s.tx.slice(0, 10)}  ${s.step}`, good, `chain says ok=${out.ok} ${out.status} "${out.refusal}"`);
}

const d = plain(await view("desk", [0]));
const want = record.desk;
check("desk 0: name, owner, categories and opening time as recorded",
  ["name", "owner", "categories", "opened_at"].every((k) => d[k] === want[k]));
check(`desk 0: at least the ${want.complaints} complaints recorded`, d.complaints >= want.complaints);

const cats = plain(await view("categories_of", [0])).categories;
check(`the ${record.categories.length} categories, their responders and windows, in the frozen order`,
  same(cats.map(({ index, text, responder, window }) => ({ index, text, responder, window })),
    record.categories.map(({ index, text, responder, window }) => ({ index, text, responder, window }))));
check("each category has at least the counts recorded",
  cats.every((c, k) => ["assigned", "answered", "breached"].every((f) => c[f] >= record.categories[k][f])));

for (const q of record.complaints) {
  const now = plain(await view("complaint", [0, q.id]));
  check(`complaint ${q.id} reads back exactly as recorded (${q.status}, category ${q.category})`, same(now, q));
  const status = await view("status", [0, q.id]);
  check(`complaint ${q.id} status is ${q.status}`, status === q.status, `chain says ${status}`);
}

console.log(`\n${failed === 0 ? "every check passed" : `${failed} check(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
