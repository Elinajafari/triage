# Evidence: Triage, second round on GenLayer StudioNet

Every row below was read back from the chain by `scripts/evidence.mjs`: the
sender, the status and the outcome come from the node's answer for each hash,
not from the deployment record. Every outcome on chain matches the record.

- **Contract:** [`0xAB91fCf0Eb32291a681daBd938e26FbCc248187B`](https://explorer-studio.genlayer.com/address/0xAB91fCf0Eb32291a681daBd938e26FbCc248187B)
- **Round:** new wallets on the contract already deployed; no deploy in this round
- **The deployment itself:** [EVIDENCE.md](EVIDENCE.md)
- **Transactions:** 4, from 2 different wallets
- **Generated:** 2026-10-07 22:24 UTC

## Wallets

Each wallet was made in memory for this run, and its key was never written
anywhere. Click an address to see every transaction it sent.

| Role | Address | Transactions sent |
|---|---|---|
| owner | [`0x5138e4105c12287220a00D7AD9726C75316e49C2`](https://explorer-studio.genlayer.com/address/0x5138e4105c12287220a00D7AD9726C75316e49C2) | 2 |
| member | [`0x7ABC26b251b64CA2180C69B108aeDD2B64bF0c93`](https://explorer-studio.genlayer.com/address/0x7ABC26b251b64CA2180C69B108aeDD2B64bF0c93) | 2 |

## Transactions, in order

"refused" is a transaction the contract was meant to refuse: the committee
agreed on the refusal, and the sentence is the contract's own.

| # | Step | Sent by | Method | On chain | Outcome | Tx |
|---|---|---|---|---|---|---|
| 0 | desk 1 opened by a new owner, who answers both categories | owner [`0x5138…49C2`](https://explorer-studio.genlayer.com/address/0x5138e4105c12287220a00D7AD9726C75316e49C2) | `open` | FINALIZED · MAJORITY_AGREE | executed | [`0xc91f139f…5b22`](https://explorer-studio.genlayer.com/tx/0xc91f139f4feda2889003371287fa3b890e1788a744c5760de55d6f95e63d5b22) |
| 1 | a new member files (expected category 1) | member [`0x7ABC…0c93`](https://explorer-studio.genlayer.com/address/0x7ABC26b251b64CA2180C69B108aeDD2B64bF0c93) | `file` | FINALIZED · MAJORITY_AGREE | executed | [`0xd3e53560…0155`](https://explorer-studio.genlayer.com/tx/0xd3e53560a5d5388a28f17ce6eaa396ad4768e777d970eddecd113dd0382c0155) |
| 2 | the member tries to answer its own complaint | member [`0x7ABC…0c93`](https://explorer-studio.genlayer.com/address/0x7ABC26b251b64CA2180C69B108aeDD2B64bF0c93) | `respond` | ACCEPTED · MAJORITY_AGREE | refused: only the responder for category 1 may answer it | [`0x1b2e1d64…24dc`](https://explorer-studio.genlayer.com/tx/0x1b2e1d647de0711abe06a16ee55c0a158654337f849e846c6f14be0346e724dc) |
| 3 | the owner answers in time | owner [`0x5138…49C2`](https://explorer-studio.genlayer.com/address/0x5138e4105c12287220a00D7AD9726C75316e49C2) | `respond` | ACCEPTED · MAJORITY_AGREE | executed | [`0x1473dea5…d38a`](https://explorer-studio.genlayer.com/tx/0x1473dea568b854ebacf9cf7584581300457436656339c47f2f321b63480dd38a) |
