// Is the contract on chain the file in this repo, and does it lint?
//
//   pnpm verify:contract
//
// 1. reads the deployed source back from the node (gen_getContractCode, or the
//    deploy transaction when that is not served);
// 2. compares it byte for byte with triage.py;
// 3. runs `genvm-lint check` on the bytes that came OFF THE CHAIN, not on the
//    local file, so a lint pass is a statement about what is deployed.
//
// genvm-lint needs GENVM_VERSION pinned to a release that ships the Python
// runner (v0.3.0-rc7); without it, the newest release is picked and fails with
// "Failed to load SDK". The pin is set here unless the caller set one.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONTRACT_FILE, RECORD_FILE, loadEnv } from "./lib.mjs";

loadEnv();
const RPC = process.env.GENLAYER_RPC ?? "https://studio.genlayer.com/api";
const record = JSON.parse(readFileSync(RECORD_FILE, "utf8"));
const address = process.argv[2] ?? record.contract;

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    // Without a User-Agent the Studio endpoint answers 403.
    headers: { "Content-Type": "application/json", "User-Agent": "triage-verify/1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const out = await res.json();
  if (out.error) throw new Error(JSON.stringify(out.error));
  return out.result;
}

function asSource(raw) {
  if (typeof raw !== "string" || !raw) return null;
  if (raw.trimStart().startsWith("#")) return raw;
  try {
    const text = Buffer.from(raw, "base64").toString("utf8");
    return text.trimStart().startsWith("#") ? text : null;
  } catch {
    return null;
  }
}

async function deployedSource() {
  try {
    const text = asSource(await rpc("gen_getContractCode", [address]));
    if (text) return [text, "gen_getContractCode"];
  } catch { /* fall through to the deploy transaction */ }
  const deploy = record.steps.find((s) => s.method === "deploy");
  const tx = await rpc("eth_getTransactionByHash", [deploy.tx]).catch(() => null);
  const text = asSource(tx?.data?.contract_code);
  if (text) return [text, `deploy tx ${deploy.tx}`];
  throw new Error(`could not read the deployed source of ${address}`);
}

const [onChain, from] = await deployedSource();
const local = readFileSync(CONTRACT_FILE, "utf8");
const norm = (s) => s.replace(/\r\n/g, "\n");
const match = norm(onChain) === norm(local);
console.log(`source read from ${from}`);
console.log(`${match ? "PASS" : "FAIL"}  the deployed source is triage.py, byte for byte`);

const dir = mkdtempSync(path.join(tmpdir(), "triage-verify-"));
const file = path.join(dir, "deployed.py");
writeFileSync(file, onChain);
const lint = spawnSync("genvm-lint", ["check", file], {
  encoding: "utf8",
  shell: process.platform === "win32",
  // genvm-lint prints non-ASCII marks; on a Windows console code page that
  // crashes it unless its output is UTF-8.
  env: { ...process.env, PYTHONIOENCODING: "utf-8", GENVM_VERSION: process.env.GENVM_VERSION ?? "v0.3.0-rc7" },
});
rmSync(dir, { recursive: true, force: true });
if (lint.error || lint.status === null) {
  console.log("FAIL  genvm-lint could not run: pip install genvm-linter");
  process.exit(1);
}
const lintOk = lint.status === 0;
console.log(`${lintOk ? "PASS" : "FAIL"}  genvm-lint check on the deployed bytes`);
if (!lintOk) console.log(lint.stdout + lint.stderr);
process.exit(match && lintOk ? 0 : 1);
