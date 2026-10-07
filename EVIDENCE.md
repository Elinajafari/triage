# Evidence: Triage on GenLayer StudioNet

Every row below was read back from the chain by `scripts/evidence.mjs`: the
sender, the status and the outcome come from the node's answer for each hash,
not from the deployment record. Every outcome on chain matches the record.

- **Contract:** [`0xAB91fCf0Eb32291a681daBd938e26FbCc248187B`](https://explorer-studio.genlayer.com/address/0xAB91fCf0Eb32291a681daBd938e26FbCc248187B)
- **Deploy transaction:** [`0xa33306aa…5779`](https://explorer-studio.genlayer.com/tx/0xa33306aa025e4b8d0a29cc271224c2f39a45bf24e36ba2be36103fd1e5a55779)
- **Source sha256:** `cf20097482a473c3cd565be32d52d3f6a0fad848428dff0a9a069a0510f7e0d1`
- **Transactions:** 14, from 6 different wallets
- **Generated:** 2026-10-07 22:23 UTC

## Wallets

Each wallet was made in memory for this run, and its key was never written
anywhere. Click an address to see every transaction it sent.

| Role | Address | Transactions sent |
|---|---|---|
| deployer | [`0x27d81e585cfFBe5Ee898271408629FaC7340DC13`](https://explorer-studio.genlayer.com/address/0x27d81e585cfFBe5Ee898271408629FaC7340DC13) | 1 |
| owner | [`0x76B29728Db501CFE2A98C1F1a3eb67Ed7ab0A162`](https://explorer-studio.genlayer.com/address/0x76B29728Db501CFE2A98C1F1a3eb67Ed7ab0A162) | 1 |
| resident | [`0xf989900C15c0a29AF25E016F6aEc6357062BAcbB`](https://explorer-studio.genlayer.com/address/0xf989900C15c0a29AF25E016F6aEc6357062BAcbB) | 5 |
| stranger | [`0x71D76dF00e4876E6BE44be750543b774766D1aCe`](https://explorer-studio.genlayer.com/address/0x71D76dF00e4876E6BE44be750543b774766D1aCe) | 4 |
| repairs | [`0xe42056D47fcD756dA54e291A4F50Eb9fC4BA40E5`](https://explorer-studio.genlayer.com/address/0xe42056D47fcD756dA54e291A4F50Eb9fC4BA40E5) | 2 |
| neighbours | [`0xa7b8344052AE01066C63c1A6a788a2dc62a1C67e`](https://explorer-studio.genlayer.com/address/0xa7b8344052AE01066C63c1A6a788a2dc62a1C67e) | 1 |

## Transactions, in order

"refused" is a transaction the contract was meant to refuse: the committee
agreed on the refusal, and the sentence is the contract's own.

| # | Step | Sent by | Method | On chain | Outcome | Tx |
|---|---|---|---|---|---|---|
| 0 | deploy | deployer [`0x27d8…DC13`](https://explorer-studio.genlayer.com/address/0x27d81e585cfFBe5Ee898271408629FaC7340DC13) | `deploy` | FINALIZED · MAJORITY_AGREE | executed | [`0xa33306aa…5779`](https://explorer-studio.genlayer.com/tx/0xa33306aa025e4b8d0a29cc271224c2f39a45bf24e36ba2be36103fd1e5a55779) |
| 1 | desk 0 opened: three categories, five minutes each | owner [`0x76B2…A162`](https://explorer-studio.genlayer.com/address/0x76B29728Db501CFE2A98C1F1a3eb67Ed7ab0A162) | `open` | FINALIZED · MAJORITY_AGREE | executed | [`0x557e8343…bd5c`](https://explorer-studio.genlayer.com/tx/0x557e834340988fabb041c9a596760899d5e5468f9702b66db02f547175a5bd5c) |
| 2 | complaint 0: a cold radiator | resident [`0xf989…AcbB`](https://explorer-studio.genlayer.com/address/0xf989900C15c0a29AF25E016F6aEc6357062BAcbB) | `file` | FINALIZED · MAJORITY_AGREE | executed | [`0xfe1574a5…ebc9`](https://explorer-studio.genlayer.com/tx/0xfe1574a5fcd737ed50163928a3f05f58313d31ae9658b3f931ab9003a85aebc9) |
| 3 | complaint 1: music after midnight | resident [`0xf989…AcbB`](https://explorer-studio.genlayer.com/address/0xf989900C15c0a29AF25E016F6aEc6357062BAcbB) | `file` | FINALIZED · MAJORITY_AGREE | executed | [`0xeae20057…fe4b`](https://explorer-studio.genlayer.com/tx/0xeae200570d36622d2fbe542b8866ee887c6c8b02218d9c45dd5c28a2b62ffe4b) |
| 4 | the same complaint again | resident [`0xf989…AcbB`](https://explorer-studio.genlayer.com/address/0xf989900C15c0a29AF25E016F6aEc6357062BAcbB) | `file` | FINALIZED · MAJORITY_AGREE | refused: this complaint was already routed as complaint 0; that answer stands | [`0xf7dc8750…c6a1`](https://explorer-studio.genlayer.com/tx/0xf7dc8750b17d455a9b9b132cf010f2d5471c8e844d5d4634b496331da1d8c6a1) |
| 5 | complaint 2: a sponsorship request | resident [`0xf989…AcbB`](https://explorer-studio.genlayer.com/address/0xf989900C15c0a29AF25E016F6aEc6357062BAcbB) | `file` | FINALIZED · MAJORITY_AGREE | executed | [`0x112a6969…6234`](https://explorer-studio.genlayer.com/tx/0x112a696996ee5048b6c4ccce1e88656587cc3d320589680a14e5ffda05eb6234) |
| 6 | a fourth complaint | resident [`0xf989…AcbB`](https://explorer-studio.genlayer.com/address/0xf989900C15c0a29AF25E016F6aEc6357062BAcbB) | `file` | FINALIZED · MAJORITY_AGREE | refused: a complainant files at most 3 complaints on one desk | [`0x804e4511…8188`](https://explorer-studio.genlayer.com/tx/0x804e45114c0ed52c30d9e55321304f54a6a6f60a6c97dd0185d7575ca02b8188) |
| 7 | a stranger answers complaint 0 | stranger [`0x71D7…1aCe`](https://explorer-studio.genlayer.com/address/0x71D76dF00e4876E6BE44be750543b774766D1aCe) | `respond` | FINALIZED · MAJORITY_AGREE | refused: only the responder for category 0 may answer it | [`0x4b31a4cc…e08b`](https://explorer-studio.genlayer.com/tx/0x4b31a4ccdad8e97944b3ab9ca1adf8e3087488665adae081e0db4cc6950ce08b) |
| 8 | repairs answers the out-of-scope request | repairs [`0xe420…40E5`](https://explorer-studio.genlayer.com/address/0xe42056D47fcD756dA54e291A4F50Eb9fC4BA40E5) | `respond` | FINALIZED · MAJORITY_AGREE | refused: this complaint is out_of_scope; only an assigned one is answered | [`0x0de9c345…8587`](https://explorer-studio.genlayer.com/tx/0x0de9c345522c7df2c79a81310a982c2496da578e781cc4dbdc0b18441f618587) |
| 9 | repairs answers complaint 0 in time | repairs [`0xe420…40E5`](https://explorer-studio.genlayer.com/address/0xe42056D47fcD756dA54e291A4F50Eb9fC4BA40E5) | `respond` | FINALIZED · MAJORITY_AGREE | executed | [`0xa0cb87b4…6f1e`](https://explorer-studio.genlayer.com/tx/0xa0cb87b41d1fb747d197ed7b813f0694b348eb886f798671d93c24cd5ca06f1e) |
| 10 | a breach recorded before the deadline | stranger [`0x71D7…1aCe`](https://explorer-studio.genlayer.com/address/0x71D76dF00e4876E6BE44be750543b774766D1aCe) | `breach` | FINALIZED · MAJORITY_AGREE | refused: the response is due by 2026-10-07T22:21:49Z | [`0xa34b2298…ae1f`](https://explorer-studio.genlayer.com/tx/0xa34b2298bddcb8fb7c5bc2cd547353cb8bf5f9fe0648bb6ebe5632d0e91eae1f) |
| 11 | neighbours answers after the deadline | neighbours [`0xa7b8…C67e`](https://explorer-studio.genlayer.com/address/0xa7b8344052AE01066C63c1A6a788a2dc62a1C67e) | `respond` | FINALIZED · MAJORITY_AGREE | refused: the response was due by 2026-10-07T22:21:49Z; anyone may now record the breach | [`0xd99b2cfa…53b1`](https://explorer-studio.genlayer.com/tx/0xd99b2cfa261a940646ce350a7d3b26dd2da90c508e6b0714570b4b8492ce53b1) |
| 12 | complaint 1 breached | stranger [`0x71D7…1aCe`](https://explorer-studio.genlayer.com/address/0x71D76dF00e4876E6BE44be750543b774766D1aCe) | `breach` | FINALIZED · MAJORITY_AGREE | executed | [`0x5e38bb27…4bbd`](https://explorer-studio.genlayer.com/tx/0x5e38bb2744d550f031baa11f62374f2fcdf5da8ea6a790ec277d2b3f8f8c4bbd) |
| 13 | a breach of an answered complaint | stranger [`0x71D7…1aCe`](https://explorer-studio.genlayer.com/address/0x71D76dF00e4876E6BE44be750543b774766D1aCe) | `breach` | ACCEPTED · MAJORITY_AGREE | refused: this complaint is answered; only an assigned one can be breached | [`0x964555fe…78b3`](https://explorer-studio.genlayer.com/tx/0x964555fefd7407276480479e846199d10571102f5de25a770a4880058a5578b3) |
