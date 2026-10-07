// A second round on the deployed contract, from two NEW wallets.
//
//   pnpm seed:activity
//
// The contract in deployments/studionet.json is not redeployed. Two wallets
// made in memory for this run, used by nothing else, run one desk:
//
//   owner     opens a desk for an allotment society and answers both categories itself
//   member    files: the tap by plot 14 is dripping            expected category 1 (water supply)
//   member    tries to answer its own complaint                refused: only the responder
//   owner     answers in time                                  answered
//
// Everything goes to deployments/studionet-activity.json, apart from the demo's
// own record, so the demo and the tests that replay it are untouched. Then
// `pnpm evidence:activity` writes EVIDENCE-ACTIVITY.md from the chain.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createAccount, generatePrivateKey } from "genlayer-js";
import { PKG, RECORD_FILE, clientFor, loadEnv, network, readRetry, recorder } from "./lib.mjs";

loadEnv();
const net = network();
if (net.name !== "studionet") throw new Error("the activity round makes throwaway wallets; run it on studionet");
const address = JSON.parse(readFileSync(RECORD_FILE, "utf8")).contract;
const data = JSON.parse(readFileSync(path.join(PKG, "demo", "activity.json"), "utf8"));
const OUT = path.join(PKG, "deployments", "studionet-activity.json");

const owner = createAccount(generatePrivateKey());
const member = createAccount(generatePrivateKey());
const asOwner = clientFor(net, owner);
const asMember = clientFor(net, member);
const ro = clientFor(net, null);
const read = (fn, args = []) => readRetry(() => ro.readContract({ address, functionName: fn, args }));
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? Number(x) : x instanceof Map ? Object.fromEntries(x) : x)));

const id = Number(await read("count"));
console.log(`\ncontract ${address} (already deployed, ${id} desks on it)\n  owner  ${owner.address}\n  member ${member.address}`);

const d = data.desk;
const rec = recorder();
await rec.write(asOwner, owner, address, "open",
  [d.name, d.categories.join("|"), d.categories.map(() => owner.address).join("|"), d.windows.join("|")],
  { step: `desk ${id} opened by a new owner, who answers both categories` });
await rec.write(asMember, member, address, "file", [id, data.complaint],
  { step: `a new member files (expected category ${data.expected_ruling})` });
const filed = plain(await read("complaints_of", [id])).complaints[0];
await rec.write(asMember, member, address, "respond", [id, filed.id, data.answer],
  { step: "the member tries to answer its own complaint", expect: "refused" });
await rec.write(asOwner, owner, address, "respond", [id, filed.id, data.answer], { step: "the owner answers in time" });

const complaints = plain(await read("complaints_of", [id])).complaints;
writeFileSync(OUT, JSON.stringify({
  network: net.name,
  contract: address,
  accounts: { owner: owner.address, member: member.address },
  steps: rec.steps,
  desks: { [id]: { desk: plain(await read("desk", [id])), categories: plain(await read("categories_of", [id])).categories, complaints } },
}, null, 2) + "\n");

for (const q of complaints) console.log(`  complaint ${q.id}  ${q.status}  category ${q.category}`);
console.log(`  written  ${path.relative(PKG, OUT)}\n`);
