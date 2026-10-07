// Run the GenVM linter on the contract file in this repository.
//
//   pnpm lint:genvm
//
// genvm-lint needs GENVM_VERSION pinned to a release that ships the Python
// runner the contract depends on (v0.3.0-rc7); without it the newest release
// is picked and fails with "Failed to load SDK". It also prints non-ASCII
// marks, which crash it on a Windows console code page unless its output is
// UTF-8. Both are set here, so the command is the same on every machine.
// `pnpm verify:contract` runs the same linter on the bytes read back from the
// chain instead.

import { spawnSync } from "node:child_process";
import { CONTRACT_FILE } from "./lib.mjs";

const run = spawnSync("genvm-lint", ["check", CONTRACT_FILE], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, PYTHONIOENCODING: "utf-8", GENVM_VERSION: process.env.GENVM_VERSION ?? "v0.3.0-rc7" },
});
if (run.error || run.status === null) {
  console.error("genvm-lint could not run: pip install genvm-linter");
  process.exit(1);
}
process.exit(run.status);
