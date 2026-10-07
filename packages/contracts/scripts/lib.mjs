// Shared plumbing for deploy.mjs, seed.mjs, e2e.mjs and verify.mjs
// (evidence.mjs is self-contained, so it can render any record).
//
// Everything here was measured against studionet with genlayer-js 1.1.8, not
// taken from a docs page:
//
//   * a receipt's `consensus_data.leader_receipt[0].result` is
//     `{ status: "return" | "rollback", payload }`, and on a rollback the
//     payload IS the sentence the contract raised. ACCEPTED only says the
//     committee agreed; a refusal is agreed on too. So success is read from
//     the leader's result, never from the status alone;
//   * view calls come back as plain objects with number fields;
//   * `initializeConsensusSmartContract()` is deprecated in 1.1.8 and prints
//     a warning, so it is not called.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet, testnetAsimov } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PKG = path.resolve(HERE, "..");
export const ROOT = path.resolve(PKG, "..", "..");
export const CONTRACT_FILE = path.join(PKG, "triage.py");
export const RECORD_FILE = path.join(PKG, "deployments", "studionet.json");
export const EXPLORER = "https://explorer-studio.genlayer.com";

// A tiny .env loader for the repo root. It never overrides a variable that is
// already set, so a value on the command line always wins.
export function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function network() {
  const name = process.argv[2] ?? process.env.GENLAYER_NETWORK ?? "studionet";
  if (name === "testnet-asimov") return { name, chain: testnetAsimov };
  if (name === "studionet") return { name, chain: studionet };
  throw new Error(`unknown network ${name}: use studionet or testnet-asimov`);
}

// A key from the environment, validated, or on studionet a throwaway key made
// in memory for this run. It is never written to disk: studionet is gasless,
// so the account holds nothing worth keeping.
export function accountFrom(envName, net) {
  const raw = (process.env[envName] ?? "").trim().replace(/^0x/, "");
  if (raw) {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error(`${envName} is not a 32 byte hex key`);
    return createAccount(`0x${raw}`);
  }
  if (net.name !== "studionet") throw new Error(`${envName} is required on ${net.name}`);
  return createAccount(generatePrivateKey());
}

export function clientFor(net, account) {
  return account ? createClient({ chain: net.chain, account }) : createClient({ chain: net.chain });
}

export function sourceSha256() {
  return createHash("sha256").update(readFileSync(CONTRACT_FILE, "utf8").replace(/\r\n/g, "\n")).digest("hex");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** What happened, read from the leader's receipt. */
export function outcome(receipt) {
  const statusName = String(receipt?.status_name ?? receipt?.statusName ?? receipt?.status ?? "");
  const leader = receipt?.consensus_data?.leader_receipt?.[0] ?? {};
  const result = leader.result ?? {};
  const kind = String(result.status ?? "").toLowerCase();
  const refusal = kind === "rollback" || kind === "user_error"
    ? (typeof result.payload === "string" ? result.payload : JSON.stringify(result.payload))
    : "";
  const settled = ["ACCEPTED", "FINALIZED", "5", "7"].includes(statusName.toUpperCase());
  return { status: statusName, ok: settled && kind === "return", refusal, resultName: receipt?.result_name ?? "" };
}

/** Poll a receipt, retrying through transport failures: a poll is a read.
 * StudioNet has been measured answering a poll with an HTML error page. */
export async function waitFor(client, hash, status = TransactionStatus.ACCEPTED) {
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    try {
      return await client.waitForTransactionReceipt({ hash, status, retries: 20, interval: 5000 });
    } catch (e) {
      if (Date.now() > deadline) throw e;
      console.log(`      still waiting on ${hash.slice(0, 12)}... (${String(e?.message ?? e).split("\n")[0].slice(0, 70)})`);
      await sleep(10_000);
    }
  }
}

/** Send once, and again only when the nonce proves nothing reached the node.
 * A plain retry would send twice if the response was lost after the node
 * accepted the transaction; an unchanged nonce is the proof it was not. */
export async function submit(client, account, send) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await readRetry(() => client.getCurrentNonce({ address: account.address }));
    try {
      return await send();
    } catch (e) {
      const reason = String(e?.message ?? e).split("\n")[0].slice(0, 80);
      await sleep(15_000);
      const after = await readRetry(() => client.getCurrentNonce({ address: account.address }));
      if (after !== before) throw new Error(`the node accepted a transaction but the answer was lost (${reason}); not sending it twice`);
      console.log(`      send did not reach the node (${reason}); retrying`);
    }
  }
  throw new Error("could not submit after 5 attempts");
}

export async function readRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 5) throw e;
      await sleep(10_000);
    }
  }
}

/** A recorder for the demo: every step, its hash, its status, its refusal. */
export function recorder() {
  const steps = [];
  return {
    steps,
    async deploy(client, account, code, args) {
      const hash = await submit(client, account, () => client.deployContract({ code, args }));
      console.log(`  deploy tx ${hash}`);
      const receipt = await waitFor(client, hash, TransactionStatus.ACCEPTED);
      const out = outcome(receipt);
      const address = receipt?.data?.contract_address ?? receipt?.data?.contractAddress ?? receipt?.contract_address;
      if (!out.ok || !address) throw new Error(`deploy did not succeed: ${out.status} ${out.resultName} ${out.refusal}`);
      steps.push({ step: "deploy", method: "deploy", from: account.address, tx: hash, status: out.status, ok: true, refusal: "", address });
      console.log(`  deploy -> ${address}`);
      return address;
    },
    async write(client, account, address, functionName, args, { step, expect = "ok", value = 0n } = {}) {
      const hash = await submit(client, account, () => client.writeContract({ address, functionName, args, value }));
      const receipt = await waitFor(client, hash);
      const out = outcome(receipt);
      steps.push({ step: step ?? functionName, method: functionName, from: account.address, tx: hash, status: out.status, ok: out.ok, refusal: out.refusal });
      const mark = out.ok ? "ok" : out.refusal ? `refused: ${out.refusal.slice(0, 90)}` : `${out.status} ${out.resultName}`;
      console.log(`  ${(step ?? functionName).padEnd(46)} ${mark}\n      tx ${hash}`);
      if (expect === "ok" && !out.ok) throw new Error(`${functionName} was expected to succeed and did not: ${mark}`);
      if (expect === "refused" && out.ok) throw new Error(`${functionName} was expected to be refused and succeeded`);
      await sleep(3000);
      return out;
    },
  };
}
