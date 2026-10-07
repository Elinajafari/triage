# Triage

**A complaints desk where every complaint is routed, and answered on a clock,
on GenLayer.** The name is the mechanism: a complaint is sorted into the one
category it belongs to the moment it is filed, and that category's promise
starts running at once.

Whoever opens a desk writes a short list of categories, and for each one the
account that must answer and how long it has. All of it is frozen. Anyone files
a complaint in their own words, and GenLayer's validators decide one thing:
which category it belongs to, or none. The contract assigns it to that
category's responder with a deadline, records the answer if it arrives in time,
and lets anyone record the breach if it does not.

**Live on studionet at `0xAB91fCf0Eb32291a681daBd938e26FbCc248187B`.**
Intelligent contract + shared type layer + scripts that deploy, seed, verify
and prove it, not a standalone contract.

> Every transaction of the live demo, and the wallet that sent it, read back
> from the chain: **[EVIDENCE.md](EVIDENCE.md)**.
> A second round from two new wallets: **[EVIDENCE-ACTIVITY.md](EVIDENCE-ACTIVITY.md)**.

---

## Why this exists

A complaint is easy to lose. It goes to the wrong team, the team says it is
someone else's, and the response time that was promised never starts. Whoever
does the triage is usually the organisation being complained about, so "not
our department" and "we would rather not" look the same from outside, and a
missed deadline leaves no trace anyone can count.

Asking a model "who should handle this, and by when?" does not fix it. It
hands the model the whole service promise, with nothing frozen to judge
against, and the deadline becomes whatever seems reasonable for the complaint
in front of it.

### In plain terms

Before anyone complains, the desk writes down its categories, who answers each
and how fast, and those never change. When someone files a complaint, the
validators each read it against the numbered categories, twice, in two
different orders, and have to agree exactly on which one it is about, or that
it is about none of them. If it fits one, it is assigned to that category's
responder and the clock starts in the same transaction. If the responder
answers in time, the complaint is answered. If not, anyone can record the
breach, and it is counted against that category for everyone to see.

Nobody, the owner included, can reassign a complaint, close it, or quietly
let its deadline slide.

### Why this needs GenLayer specifically

Whether "the radiator has been cold for a week and the boiler pressure keeps
dropping" is a repair inside a flat, whether "my neighbour plays loud music
after midnight" is about another resident's behaviour, and whether "please
sponsor my son's football team" is a complaint at all, is a judgment about
natural language. A normal smart contract cannot make it. An LLM can, but a
single model run by the organisation being complained about is the same
triage desk with a new tool.

Here the reading is done by a validator quorum under consensus rules, and the
deadline and the breach live on the same chain. Everything that is not a
judgment is kept away from the model: the categories, their responders and
their windows were fixed in advance, the answer is an index into a list the
contract already holds, and a complaint that only fits a category when that
category is listed first is recorded as fitting none. A model answer that
cannot be parsed fails closed: it is raised as `[LLM_ERROR]`, which no
validator agrees with, so a broken model can never assign anyone anything.

### How you actually use it

1. **Open a desk** (anyone): `open(name, categories, responders, windows)`
   with each list joined by `|`. You are recorded as the owner, which gives you
   no power over any complaint.
2. **File** (anyone, three per desk): `file(desk, text)`. Validators route it,
   and its deadline starts at once.
3. **Answer** (the assigned responder, before the deadline):
   `respond(desk, id, text)`.
4. **Record a breach** (anyone, after the deadline): `breach(desk, id)`.
5. **Rely on it from another contract**: `categories_of()` counts each
   category's complaints assigned, answered in time, and breached.

   ```python
   triage = gl.get_contract_at(Address(TRIAGE))
   row = triage.view().categories_of(desk_id)["categories"][k]
   if row["breached"] > 2:
       ...  # e.g. withhold a service-level bonus from that team
   ```

## Stack

| Layer | Tech |
|---|---|
| Contract | GenLayer Intelligent Contract, Python (GenVM): [`packages/contracts/triage.py`](packages/contracts/triage.py) |
| Consensus | custom leader/validator with `gl.vm.run_nondet_unsafe`: a free structural check, then exact agreement on the frozen category index |
| Tests | pytest on a GenVM stand-in that runs the real file and moves the chain's clock, plus a mutation pass that breaks every defence on purpose |
| Chain client | `genlayer-js` 1.1.8: deploy, seed, e2e, verify and evidence scripts |
| Types | [`packages/shared`](packages/shared): view types, parsers and a port of the contract's deterministic rules, tested against vectors generated from the contract |

There is no backend and no database. Every value in this repository's record
was read back from the chain.

---

## Quick start

```bash
pnpm install
pip install -r packages/contracts/requirements-dev.txt

pnpm test               # contract (pytest) + shared (vitest), no chain needed
```

Deploy your own copy and put the whole demo on the explorer:

```bash
pnpm deploy:contract    # a fresh deployer wallet deploys packages/contracts/triage.py
pnpm seed:contract      # 1 desk, 3 complaints routed, 1 answered, 1 breached, 1 out of scope, 7 refusals
pnpm e2e:contract       # re-reads every transaction and every view: PASS/FAIL
pnpm evidence:contract  # rewrites EVIDENCE.md from the chain
```

| Command | What it does |
|---|---|
| `pnpm test` | contract and shared suites |
| `pnpm test:contract` | pytest against `triage.py`, no chain needed |
| `pnpm test:shared` | vitest: the TypeScript port against the contract's vectors, and the parsers against the live record |
| `pnpm typecheck` | `tsc --noEmit` on the shared package |
| `pnpm mutate:contract` | removes every defence one at a time; every mutant must be caught by a named test |
| `pnpm measure:contract` | runs the suite and the mutation pass and renders the numbers into the contract README |
| `pnpm lint:genvm` | GenVM linter on the contract, pinned to the runner it depends on |
| `pnpm deploy:contract` | deploy to studionet (a throwaway deployer key) |
| `pnpm seed:contract` | the demo: every route and every refusal, recorded; waits about five minutes so the breach is real |
| `pnpm seed:activity` | a second round on the deployed contract from two new wallets, recorded apart from the demo |
| `pnpm e2e:contract` | the record checked against the live chain |
| `pnpm verify:contract` | the deployed source, byte for byte against the file, and linted |
| `pnpm evidence:contract` | EVIDENCE.md: every transaction and its sender, from the chain |
| `pnpm evidence:activity` | EVIDENCE-ACTIVITY.md: the second round, from the chain |
| `pnpm demo:contract` | deploy, seed, e2e and evidence in one go |

### Configuration

Copy `.env.example` to `.env`. On studionet nothing is needed: every role gets
a wallet made in memory for the run, and no key is ever written to disk. On any
other network (`GENLAYER_NETWORK=testnet-asimov`) the scripts refuse to run
without a key for every role in `.env.example`.

## The live demo

A housing co-op's complaints desk with three categories: repairs inside a flat
(0), noise or behaviour of other residents (1), and rent or billing mistakes
(2), each with five minutes to answer.

| Complaint | Routed to | What happened |
|---|---|---|
| "The radiator in my bedroom has been stone cold for a week and the boiler pressure keeps dropping..." | **category 0**, both orders | repairs **answered** in time |
| "My upstairs neighbour in flat 5B plays loud music past one in the morning..." | **category 1**, both orders | nobody answered; once the deadline passed a stranger recorded it **breached** |
| "Could the co-op sponsor my son's under-twelves football team this season?" | **none** | a request, not a complaint: **out of scope** |

Around them, seven refusals, each from the wallet it is about: the same
complaint filed again, a fourth complaint, a stranger answering, a responder
answering an out-of-scope request, a breach recorded too early, an answer after
the deadline, and a breach of an answered complaint. Full detail, with every
hash: [EVIDENCE.md](EVIDENCE.md) and
[`packages/contracts/README.md`](packages/contracts/README.md#verified-against-the-live-deployment).

### Second round, two new wallets

`pnpm seed:activity` ran on the same contract from two wallets that had never
been used: a new owner opened a desk for an allotment society and named itself
the responder for both categories; a new member filed that the tap by plot 14
is dripping and the ground is flooded, which the validators routed to **water
supply (1)**; the member's attempt to answer its own complaint was refused; and
the owner **answered** in time. Every hash:
[EVIDENCE-ACTIVITY.md](EVIDENCE-ACTIVITY.md).

## Repo layout

```
.
├─ packages/
│  ├─ contracts/                 the Intelligent Contract and everything that proves it
│  │  ├─ triage.py               the contract
│  │  ├─ tests/                  pytest on a GenVM stand-in (see tests/README.md)
│  │  ├─ scripts/                deploy · seed · e2e · verify · evidence · lint · mutate · measure
│  │  ├─ demo/demo.json          the demo, read by the seed script AND the tests
│  │  ├─ deployments/            studionet.json, written by the scripts, never by hand
│  │  ├─ lib/                    the routing rules, generated from the contract
│  │  └─ DECISIONS.md            why every rule is the way it is
│  └─ shared/                    types, parsers, contract-shape.json, the rules port and its vectors
├─ EVIDENCE.md                   every live transaction and its sender
├─ EVIDENCE-ACTIVITY.md          the second round, two new wallets
├─ .env.example
└─ package.json · pnpm-workspace.yaml
```

## License

MIT © 2026 Elina ([@Elinajafari](https://github.com/Elinajafari))
