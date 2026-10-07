// Put the demo on the explorer: every route the contract has, refusals included.
//
//   pnpm seed:contract
//
// Reads the address from deployments/studionet.json (written by deploy.mjs),
// opens the desk in demo/demo.json, files three complaints, has one answered
// in time, and waits on the chain's clock until another has missed its
// deadline, then records the breach. It sends every write the contract
// exists to refuse. Everything is appended to the same record: each
// transaction hash and its sender, its status, the refusal sentence where
// there was one, and the desk, its categories and every complaint as the
// chain holds them. Nothing in that file is typed by hand.
//
// Six wallets act, each in one role: the owner (opens the desk and can do
// nothing more), a resident (files), three responders (repairs, neighbours,
// billing; billing never has to act) and a stranger. They come from
// OWNER_PRIVATE_KEY, RESIDENT_PRIVATE_KEY, REPAIRS_PRIVATE_KEY,
// NEIGHBOURS_PRIVATE_KEY, BILLING_PRIVATE_KEY and STRANGER_PRIVATE_KEY, or on
// studionet are made in memory for this run and never written to disk. The
// run stops at the first step that does not do what the demo expects,
// because the record claims whatever it holds.
//
// The steps are the ones tests/test_runbook.py replays offline, in the same
// order, so a demo that could not succeed fails a test before it costs a
// transaction.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PKG, RECORD_FILE, accountFrom, clientFor, loadEnv, network, readRetry, recorder, sleep, sourceSha256 } from "./lib.mjs";

loadEnv();
const net = network();
const record = JSON.parse(readFileSync(RECORD_FILE, "utf8"));
if (record.source_sha256 !== sourceSha256()) {
  throw new Error("triage.py has changed since it was deployed; run pnpm deploy:contract first");
}
const address = record.contract;
const demo = JSON.parse(readFileSync(path.join(PKG, "demo", "demo.json"), "utf8"));

const owner = accountFrom("OWNER_PRIVATE_KEY", net);
const resident = accountFrom("RESIDENT_PRIVATE_KEY", net);
const repairs = accountFrom("REPAIRS_PRIVATE_KEY", net);
const neighbours = accountFrom("NEIGHBOURS_PRIVATE_KEY", net);
const billing = accountFrom("BILLING_PRIVATE_KEY", net);
const stranger = accountFrom("STRANGER_PRIVATE_KEY", net);
const as = new Map([owner, resident, repairs, neighbours, billing, stranger].map((a) => [a, clientFor(net, a)]));
const ro = clientFor(net, null);
console.log(`\ncontract ${address}\n  owner      ${owner.address}\n  resident   ${resident.address}\n  repairs    ${repairs.address}` +
  `\n  neighbours ${neighbours.address}\n  billing    ${billing.address}\n  stranger   ${stranger.address}`);

const rec = recorder();
const send = (who, fn, args, step, expect = "ok") => rec.write(as.get(who), who, address, fn, args, { step, expect });
const read = (fn, args = []) => readRetry(() => ro.readContract({ address, functionName: fn, args }));
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? Number(x) : x instanceof Map ? Object.fromEntries(x) : x)));

const d = demo.desk;
const c = demo.complaints;
const existing = Number(await read("count"));
if (existing !== 0) throw new Error(`the demo expects a fresh contract; this one already has ${existing} desks`);

// A routing must come back as the demo expects, or every step after it would
// be recorded against the wrong story: stop here instead.
async function file(text, step, want) {
  await send(resident, "file", [0, text], step);
  const rows = plain(await read("complaints_of", [0])).complaints;
  const got = rows[rows.length - 1];
  console.log(`      routed ${got.category}: ${got.why}`);
  if (got.category !== want) throw new Error(`complaint ${got.id} was routed ${got.category}, the demo expects ${want}`);
}

console.log("\nthe desk");
await send(owner, "open", [d.name, d.categories.join("|"), [repairs, neighbours, billing].map((a) => a.address).join("|"),
  d.windows.join("|")], "desk 0 opened: three categories, five minutes each");

console.log("\nthe complaints");
await file(c.radiator, "complaint 0: a cold radiator", demo.expected_rulings[0]);
await file(c.noise, "complaint 1: music after midnight", demo.expected_rulings[1]);
await send(resident, "file", [0, c.radiator], "the same complaint again", "refused");
await file(c.sponsor, "complaint 2: a sponsorship request", demo.expected_rulings[2]);
await send(resident, "file", [0, c.billing], "a fourth complaint", "refused");

console.log("\nthe answers");
await send(stranger, "respond", [0, 0, demo.answers.radiator], "a stranger answers complaint 0", "refused");
await send(repairs, "respond", [0, 2, demo.answers.radiator], "repairs answers the out-of-scope request", "refused");
await send(repairs, "respond", [0, 0, demo.answers.radiator], "repairs answers complaint 0 in time");
await send(stranger, "breach", [0, 1], "a breach recorded before the deadline", "refused");

console.log("\nthe deadline");
const due = Date.parse(plain(await read("complaint", [0, 1])).due);
for (let left = due + 20_000 - Date.now(); left > 0; left = due + 20_000 - Date.now()) {
  console.log(`  waiting ${Math.ceil(left / 1000)} s for complaint 1's deadline`);
  await sleep(Math.min(left, 30_000));
}
await send(neighbours, "respond", [0, 1, demo.answers.late], "neighbours answers after the deadline", "refused");
await send(stranger, "breach", [0, 1], "complaint 1 breached");
await send(stranger, "breach", [0, 0], "a breach of an answered complaint", "refused");

const out = {
  ...record,
  accounts: {
    deployer: record.deployer, owner: owner.address, resident: resident.address, repairs: repairs.address,
    neighbours: neighbours.address, billing: billing.address, stranger: stranger.address,
  },
  steps: [...record.steps.filter((st) => st.step === "deploy"), ...rec.steps],
  desk: plain(await read("desk", [0])),
  categories: plain(await read("categories_of", [0])).categories,
  complaints: plain(await read("complaints_of", [0])).complaints,
};
writeFileSync(RECORD_FILE, JSON.stringify(out, null, 2) + "\n");

console.log("");
for (const q of out.complaints) console.log(`  complaint ${q.id}  ${q.status.padEnd(12)} category ${q.category}`);
console.log(`  written  ${path.relative(PKG, RECORD_FILE)}\n`);
