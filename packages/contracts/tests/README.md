# Contract tests

Triage is tested at four levels, from the cheapest to the one that costs real
transactions. Each level has one command.

| Level | Command | Needs | What it proves |
|---|---|---|---|
| 1. Offline suite | `pnpm test:contract` | Python + pytest | the contract file itself behaves as specified, including against a lying leader and a moving clock |
| 2. Mutation pass | `pnpm mutate:contract` | same | every defence is covered by a test that fails without it |
| 3. Live demo | `pnpm deploy:contract && pnpm seed:contract` | Node 20+ | the same behaviour happens on StudioNet, with real validators, real models and the chain's own clock |
| 4. Chain checks | `pnpm e2e:contract`, `pnpm verify:contract`, `pnpm evidence:contract` | Node 20+ | what the record claims is what the chain holds, and what is deployed is this file |

## 1. The offline suite

```bash
pip install -r requirements-dev.txt
pnpm test:contract   # from the repo root, or here: python -m pytest tests -q
```

It runs the real `packages/contracts/triage.py` on [`tests/glsim.py`](glsim.py), a
small GenVM stand-in. The stand-in gives the leader and each validator their own
mock model answers, can make a leader lie, sets the transaction time the
contract reads, and refuses what GenVM refuses.

| File | What it covers |
|---|---|
| [`test_logic.py`](test_logic.py) | the pure rules: text cleaning, the pipe-joined desk (an empty category is kept, so nothing renumbers) and every way it is refused, whole-second windows, reading a model's answer, reading the reversed answer back, the fold of the two orders, the structural check, the agreement, the fence and the prompt, and that `lib/triage_consensus.py` is exactly the contract's code |
| [`test_e2e.py`](test_e2e.py) | the contract executed: `open` and its bounds; `file` (routed and on a clock in one transaction, each category's own window, none is out of scope, three per complainant, each wording once, desks kept apart, both orders, a leader that routes nowhere or to the wrong team, a malformed one refused for free, an `[LLM_ERROR]` never agreed with); `respond` (the assigned responder only, on the deadline's last second and not after, once); `breach` (anyone, only after the deadline, counted per category); and static checks over the parsed source (runner pinned, class named after the product, pure ASCII, storage types, the block never touches storage, prompts only inside the block, the owner has no power, the clock starts only after consensus) |
| [`test_runbook.py`](test_runbook.py) | the live demo replayed offline from [`demo/demo.json`](../demo/demo.json), with the clock moved past the noise complaint's deadline, before any transaction is spent; and once `deployments/studionet.json` exists, the validators' real routings are replayed through this file, which must assign, answer and breach exactly as the deployed contract did |
| [`test_vectors.py`](test_vectors.py) | `packages/shared/triage-vectors.json` is exactly what this contract's text cleaning, desk checks, window parsing, answer reading, order folding and structural check compute, so the TypeScript port in `packages/shared` is tested against the contract's own answers (`UPDATE_VECTORS=1` regenerates it) |
| [`test_shape.py`](test_shape.py) | `packages/shared/contract-shape.json` describes every public write and view, its parameters and types, and the fields the live deployment returned, exactly; any drift on either side fails |

The last group, `TestTheRecord`, is skipped until a deployment has been
recorded, and then runs every time.

## 2. The mutation pass

```bash
pnpm mutate:contract
```

[`scripts/mutate.py`](../scripts/mutate.py) makes small edits to a copy of the
contract, each one removing a defence ("an answer after the deadline is
accepted", "anyone may answer", "a breach is recorded before the deadline",
"the validator agrees with anything", ...), runs the suite against each, and
names the test that failed. A mutant that survives is a missing test, and the
script exits non-zero. It refuses to run on a red baseline, and a mutation
whose target text is missing or ambiguous is a failure, never a skip. The table
in the README is its output.

## 3. The live demo

```bash
pnpm install
pnpm deploy:contract          # a fresh deployer wallet deploys packages/contracts/triage.py
pnpm seed:contract            # a fresh owner, resident, three responders and a stranger run the demo
```

Seven wallets, one role each, all made in memory for the run:

| Wallet | Does |
|---|---|
| deployer | deploys the contract, nothing else |
| owner | opens the desk, and can do nothing more |
| resident | files the complaints, and one it may not |
| repairs | answers the radiator in time; tries to answer the out-of-scope request |
| neighbours | misses its deadline, then tries to answer late |
| billing | is named in the desk and never has to act |
| stranger | tries to answer and to breach too early, then records the real breach |

The desk is a housing co-op's: repairs inside a flat (0), noise or behaviour of
other residents (1), rent or billing mistakes (2), each with five minutes to
answer.

Every transaction, in order, and what it proves. The expected outcome is part
of the script: if the chain does anything else, including a routing other than
the one the demo expects, the run stops, because the record claims whatever it
holds.

| # | Sent by | Call | Expected | What it proves |
|---|---|---|---|---|
| 0 | deployer | deploy | deployed | the file deploys as it is; its sha256 is recorded |
| 1 | owner | `open` desk 0 | executed | three categories, their responders and windows are frozen |
| 2 | resident | `file` a cold radiator | **category 0** | routed to repairs, its clock started |
| 3 | resident | `file` music after midnight | **category 1** | routed to neighbours, its clock started |
| 4 | resident | `file` the radiator again | refused | each wording is routed once |
| 5 | resident | `file` sponsor a football team | **none** | a request is not a complaint: out of scope |
| 6 | resident | `file` a fourth complaint | refused | three per complainant |
| 7 | stranger | `respond` to complaint 0 | refused | only the assigned responder answers |
| 8 | repairs | `respond` to complaint 2 | refused | an out-of-scope complaint takes no answer |
| 9 | repairs | `respond` to complaint 0 | **answered** | in time |
| 10 | stranger | `breach` complaint 1 | refused | not before its deadline |
| 11 | neighbours | `respond` to complaint 1 late | refused | the deadline is the deadline |
| 12 | stranger | `breach` complaint 1 | **breached** | anyone may record it; counted on category 1 |
| 13 | stranger | `breach` complaint 0 | refused | an answered complaint is not breached |

Before step 11 the script reads complaint 1's deadline from the chain and waits
until it has passed by 20 seconds. The seed then reads the desk, its categories
and every complaint back from the chain into
[`deployments/studionet.json`](../deployments/studionet.json).

## 4. Checking the chain, not the record

```bash
pnpm e2e:contract             # PASS/FAIL per check
pnpm verify:contract          # the deployed source, byte for byte, and genvm-lint on it
pnpm evidence:contract        # EVIDENCE.md
```

- **`e2e`** fetches every recorded transaction again and checks that the chain
  still says what the record says (executed, or refused with the same
  sentence), then re-reads the desk, its categories and every complaint. Every
  demo complaint is closed, so each must match exactly; the desk stays open, so
  counts that can only grow must be at least what was recorded.
- **`verify`** reads the deployed source back with `gen_getContractCode`,
  compares it byte for byte with `packages/contracts/triage.py`, and runs genvm-lint on
  the bytes that came off the chain (pinned to GenVM `v0.3.0-rc7`).
- **`evidence`** builds [EVIDENCE.md](../../../EVIDENCE.md) from the chain's answers
  alone: for each hash the sender, the status and the outcome, plus a table of
  the wallets and how many transactions each sent. A row whose on-chain
  outcome disagrees with the record is marked.

A refusal still reaches ACCEPTED or FINALIZED: the committee agreed that the
contract refused. That is why every script reads the leader's result (`return`
or `rollback`) and never treats the status alone as success.

## Measuring

```bash
pnpm measure:contract
```

Runs the suite and the mutation pass now and renders their numbers, and the
live record, into the README. It writes nothing if the suite is red, a mutant
escapes, or the record is of a different contract file.
