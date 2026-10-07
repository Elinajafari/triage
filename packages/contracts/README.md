# Triage - GenLayer Intelligent Contract

[`triage.py`](./triage.py) is the whole protocol: whoever opens a desk writes
its categories, and for each one the account that must answer it and how long
it has, and all three are frozen. Anyone files a complaint in their own words;
validators decide by consensus, in two orders, which category it belongs to or
none; the contract assigns it to that category's responder with a deadline in
the same transaction, records the answer if it comes in time, and lets anyone
record the breach if it does not.

## Core rule

```
categories, responders and windows are frozen at open(), before the first complaint
a routing is an index into the frozen categories, or none: the model never picks a person or a deadline
a complaint is routed in the transaction that files it, so nothing ever waits for a ruling
due = filing time + the category's window; answered on or before it, breached after it
the owner has no power over any complaint; three complaints per complainant; each wording routed once
```

## Lifecycle

```
anyone:      open(name, categories, responders, windows)   frozen; the caller is the owner, with no power
anyone:      file(desk, text)        [validators, both orders] -> category k: assigned, due now + window k
                                                                 none: out_of_scope, nobody has to answer
responder:   respond(desk, id, text) the assigned responder only, until the deadline -> answered
anyone:      breach(desk, id)        after the deadline of an unanswered complaint -> breached, counted on k
anyone:      count, desk, categories_of, complaints_of, complaint, status
```

Judgment fails **closed**: an unusable model answer is retried once inside
the block and then raised as `[LLM_ERROR]`, which no validator agrees with.
It never assigns anyone anything. There is no pending ruling: the complaint is
routed when it is filed, and the only clock after that is the responder's.

## Deploy

```bash
pnpm install                          # from the repo root
pnpm deploy:contract                  # studionet, a deployer key made for this run
pnpm deploy:contract testnet-asimov   # needs DEPLOYER_PRIVATE_KEY in .env
pnpm seed:contract                    # the demo, recorded in deployments/studionet.json
pnpm e2e:contract                     # the record checked against the chain
pnpm verify:contract                  # deployed source == triage.py, and genvm-lint on it
pnpm evidence:contract                # EVIDENCE.md at the repo root, from the chain
```

Every script reads a transaction's outcome from the leader's result
(`return` or `rollback`), never from `ACCEPTED` alone: the committee accepts a
refusal too. Sends are nonce-guarded, so a lost answer is never sent twice.
Why each rule is the way it is: [DECISIONS.md](DECISIONS.md).

## Surface

| Thing | What it is |
|---|---|
| **Desk** | a name, an owner (who opened it), and up to 6 frozen categories |
| **Category** | agreed wording, 8 to 160 characters; the responder who answers it; a window of 60 s to 90 days; counts of assigned, answered and breached |
| **Complaint** | a complainant's text, 20 to 1200 characters, with the chain's time; routed once |
| **Routing** | the frozen index of the category, or `none` (out of scope) |
| **Status** | `out_of_scope`, `assigned` (on a clock), `answered` (in time), `breached` (not) |

| Write | Caller | Why |
|---|---|---|
| `open(name, categories, responders, windows)` | anyone | the caller becomes the owner, who has no power over complaints |
| `file(desk, text)` | anyone, three per desk | the complaint is on chain in its author's name; each wording is routed once |
| `respond(desk, id, text)` | the responder the complaint was assigned to, until its deadline | the promise was made by the category, and is kept or not by its responder |
| `breach(desk, id)` | anyone, deliberately, after the deadline | it reads no model and records only what the clock implies; a responder who vanishes cannot keep a complaint open |

| View | Returns |
|---|---|
| `count()` | number of desks |
| `desk(id)` | name, owner, how many categories and complaints |
| `categories_of(id)` | each category, its responder and window, and how many complaints it was assigned, answered in time, and breached |
| `complaints_of(id)` | every complaint, oldest first |
| `complaint(desk, id)` | one complaint: text, routing, status, deadline, answer, who recorded a breach, the leader's reason |
| `status(desk, id)` | one word for another contract |

```python
triage = gl.get_contract_at(Address(TRIAGE))
row = triage.view().categories_of(desk_id)["categories"][k]
if row["breached"] > 2:
    ...  # e.g. withhold a service-level bonus from that team
```

## How it holds together

```
file(desk, text)            the complaint is on the record, with the chain's time, before any model reads it
  └─ nondet block
        leader                                 validator
        ask with the categories                refuse a ruling that names no category
        in frozen order, then reversed         of the desk (free)
        same category in both → it, else none  ask both orders itself, compare exactly
        send the category index                an [LLM_ERROR] is never agreed with
  deterministic half: check the ruling again, assign it to the category's responder,
  start the category's clock, count it
respond() by that responder before the deadline → answered
breach() by anyone after it → breached, counted on the category
```

A complaint that only fits a category when that category is listed first does
not clearly fit it. That uncertainty goes into the value (out of scope), never
into the comparison.

## Threat model

| Attack | What stops it |
|---|---|
| "Not our department" | the categories are frozen at `open()`; a routing is consensus, and the clock starts in the same transaction |
| A team that lets complaints rot | a missed deadline is recorded by anyone and counted against the category, in public |
| An owner who reassigns or deletes a complaint | there is no such call; the owner has no power at all, and a static test checks nothing compares a caller with it |
| An answer sent by someone else to close a complaint | only the assigned responder may answer |
| A late answer that hides a breach | an answer after the deadline is refused; the breach stays recordable |
| A leader that routes a complaint nowhere, or to the wrong team | every validator asks both orders itself and must match exactly |
| A leader proposes a category past the list | refused for free before the validator spends a prompt, and again in the deterministic half |
| A broken model routes by failing | an unusable answer is retried once, then raised as `[LLM_ERROR]`, which no validator agrees with |
| A routing that depends on the order it was shown | both orders inside one block; a difference is `none` |
| Flooding the desk, or re-filing until it routes differently | three complaints per complainant per desk; each wording, in any spacing or case, is routed once |
| Prompt injection inside a complaint, a category or the name | `fence()` replaces `< > [ ]` at the prompt boundary and the contract numbers the categories itself |
| A script reports "done" when the contract refused | success is the leader's `return`, not `ACCEPTED`; a `rollback` is recorded with the contract's own sentence |

## Tests

<!-- measured:tests:start -->
Measured: **146 passed**, 0 skipped, including the checks of the live record in `deployments/studionet.json`, which run once `pnpm seed:contract` has written it. The same record is checked against the chain itself by `pnpm e2e:contract`.
<!-- measured:tests:end -->

The suite runs on [`tests/glsim.py`](tests/glsim.py), a small GenVM stand-in
that executes the real contract file, gives the leader and the validator their
own mock answers, can make a leader lie, sets the chain's clock, and refuses
what GenVM refuses. What each file covers, and what every demo transaction
proves, is in [tests/README.md](tests/README.md).

**The tests have teeth.** [`scripts/mutate.py`](scripts/mutate.py) removes every
defence one at a time and names the test that caught each mutant. It refuses to
run on a red baseline and exits non-zero if anything escapes.

<!-- measured:mutations:start -->
Measured: **62 mutations, 62 caught, 0 escaped.**

| Mutation | Caught by |
|---|---|
| an answer after the deadline is accepted | `test_an_answer_on_the_last_second_lands_and_one_after_is_refused` |
| an answer on the last second is refused | `test_an_answer_on_the_last_second_lands_and_one_after_is_refused` |
| a breach is recorded before the deadline | `test_anyone_records_the_breach_once_the_deadline_has_passed` |
| a breach is recorded on the deadline itself | `test_anyone_records_the_breach_once_the_deadline_has_passed` |
| the deadline ignores the category's window | `test_each_category_starts_its_own_window` |
| the deadline is the filing time | `test_a_complaint_is_routed_and_its_clock_starts_in_the_same_transaction` |
| anyone may answer | `test_only_the_assigned_responder_may_answer` |
| an out-of-scope complaint can be answered | `test_an_out_of_scope_complaint_takes_no_answer` |
| an answered complaint can be breached | `test_anyone_records_the_breach_once_the_deadline_has_passed` |
| a complaint of another desk is reachable here | `test_two_desks_never_see_each_other_s_rows` |
| a routed complaint is out of scope | `test_a_complaint_is_routed_and_its_clock_starts_in_the_same_transaction` |
| a routed complaint is not counted on its category | `test_a_complaint_is_routed_and_its_clock_starts_in_the_same_transaction` |
| an answer is not counted | `test_the_assigned_responder_answers_in_time` |
| a breach is not counted | `test_anyone_records_the_breach_once_the_deadline_has_passed` |
| the breach is not marked | `test_anyone_records_the_breach_once_the_deadline_has_passed` |
| who recorded the breach is not kept | `test_anyone_records_the_breach_once_the_deadline_has_passed` |
| the answer is not marked | `test_the_assigned_responder_answers_in_time` |
| a complainant files any number of complaints | `test_a_complainant_files_three_at_most` |
| the filing count is not kept | `test_a_complainant_files_three_at_most` |
| a complaint is routed again | `test_the_same_complaint_is_routed_once_whoever_files_it` |
| a routed complaint is not remembered | `test_the_same_complaint_is_routed_once_whoever_files_it` |
| the decided wordings care about capitalisation | `test_a_complaint_is_routed_and_its_clock_starts_in_the_same_transaction` |
| a complaint of any length is accepted | `test_the_complaint_length_bounds` |
| an answer of any length is accepted | `test_the_answer_length_bounds` |
| complaints are not linked | `test_the_expected_rulings_answer_one_breach_one_and_scope_out_one` |
| the reversed list is the frozen list | `test_a_complaint_is_routed_and_its_clock_starts_in_the_same_transaction` |
| the reversed answer is not read back | `test_a_complaint_is_routed_and_its_clock_starts_in_the_same_transaction` |
| unreverse is the identity | `test_a_complaint_is_routed_and_its_clock_starts_in_the_same_transaction` |
| a disagreement between the orders keeps the forward category | `test_a_category_that_depends_on_the_order_is_none` |
| a disagreement between the orders keeps the reverse category | `test_a_category_that_depends_on_the_order_is_none` |
| a number outside the desk is accepted | `test_an_unusable_answer_is_an_error_and_never_a_routing` |
| an answer in words is read as a number | `test_an_unusable_answer_is_an_error_and_never_a_routing` |
| an unusable answer is not retried | `test_an_unusable_answer_is_an_error_and_never_a_routing` |
| a bare value is read as if it were an object | `test_an_unusable_answer_is_an_error_and_never_a_routing` |
| an unusable answer becomes out of scope | `test_an_unusable_answer_is_an_error_and_never_a_routing` |
| the validator agrees with a leader error | `test_an_unusable_answer_is_an_error_and_never_a_routing` |
| the validator skips the free structural check | `test_a_ruling_that_names_no_category_is_refused_for_free` |
| the validator agrees with anything | `test_nodes_that_route_differently_do_not_agree_and_nothing_is_stored` |
| agreement ignores the structural check | `test_agreement_is_exact_symmetric_and_over_sound_rulings` |
| a category beyond the desk is sound | `test_a_ruling_that_names_no_category_is_refused_for_free` |
| the agreed ruling is not checked again before it assigns | `test_the_agreed_ruling_is_checked_again_before_it_assigns_anyone` |
| the fence does nothing | `test_caller_text_is_stored_verbatim_and_fenced_only_at_the_prompt` |
| the categories reach the prompt unfenced | `test_every_value_interpolated_into_the_prompt_is_fenced_or_ours` |
| the complaint reaches the prompt unfenced | `test_caller_text_is_stored_verbatim_and_fenced_only_at_the_prompt` |
| the desk name reaches the prompt unfenced | `test_every_value_interpolated_into_the_prompt_is_fenced_or_ours` |
| the prompt no longer states how many categories there are | `test_the_range_is_stated_and_the_example_is_never_a_valid_answer` |
| the prompt no longer scopes out requests | `test_the_prompt_judges_what_a_complaint_is_about_not_whether_it_is_justified` |
| the prompt judges whether a complaint is justified | `test_the_prompt_judges_what_a_complaint_is_about_not_whether_it_is_justified` |
| the leader's reason is stored raw | `test_the_reason_is_not_compared_and_is_stored_sanitised` |
| the leader's reason is not capped | `test_the_reason_is_not_compared_and_is_stored_sanitised` |
| a desk name of any length is accepted | `test_the_name_bounds` |
| the desk refusal is ignored | `test_the_desk_bounds` |
| an empty desk is accepted | `test_every_shape_error_is_refused_with_its_reason` |
| more than six categories are accepted | `test_the_desk_bounds` |
| a category of any length is accepted | `test_the_desk_bounds` |
| two categories with the same wording are accepted | `test_the_desk_bounds` |
| a missing responder is accepted | `test_the_desk_bounds` |
| a responder that is not an address is accepted | `test_the_desk_bounds` |
| a missing window is accepted | `test_the_desk_bounds` |
| a window of any length is accepted | `test_the_desk_bounds` |
| a missing category is dropped and the rest renumbered | `test_the_desk_bounds` |
| control characters are stored | `test_text_is_one_line_and_never_cut` |
<!-- measured:mutations:end -->

## Verified against the live deployment

<!-- measured:deployment:start -->
Deployed on studionet at [`0xAB91fCf0Eb32291a681daBd938e26FbCc248187B`](https://explorer-studio.genlayer.com/address/0xAB91fCf0Eb32291a681daBd938e26FbCc248187B) (deploy [`0xa33306aa...`](https://explorer-studio.genlayer.com/tx/0xa33306aa025e4b8d0a29cc271224c2f39a45bf24e36ba2be36103fd1e5a55779)). Desk 0, *Riverside Housing Co-op, residents' complaints*, was opened with 3 categories. Every value below was read back from the chain by `scripts/seed.mjs` and written to [`deployments/studionet.json`](deployments/studionet.json); none of it is typed by hand.

| Category | Window | Assigned | Answered in time | Breached |
|---|---|---|---|---|
| 0: Repairs inside a flat: heating, hot water, plumbing, electrics, windows or doors | 300 s | 1 | 1 | 0 |
| 1: Noise or behaviour of other residents or their visitors | 300 s | 1 | 0 | 1 |
| 2: Rent, service charges or billing mistakes | 300 s | 0 | 0 | 0 |

Every complaint, where the validators routed it, and what happened:

| Complaint | Text | Routed to | Status | Reason the leader gave (not consensus) |
|---|---|---|---|---|
| 0 | The radiator in my bedroom has been stone cold for a week and the boiler pressur... | 0: Repairs inside a flat: heating, hot water, plumbing, electrics, windows or doors | **answered** | Radiator is cold and boiler pressure low, indicating a heating repair problem. |
| 1 | My upstairs neighbour in flat 5B plays loud music past one in the morning every ... | 1: Noise or behaviour of other residents or their visitors | **breached** | The complaint describes a problem regarding the noise and behavior of another resident. |
| 2 | Could the co-op sponsor my son's under-twelves football team this season? They n... | none: out of scope | **out_of_scope** | This is a sponsorship request for a football team, not a complaint about housing repairs, neighbour behaviour, or billing. |

Every transaction, in order, refusals included:

| Step | Outcome | Transaction |
|---|---|---|
| desk 0 opened: three categories, five minutes each | ok | [`0x557e8343...`](https://explorer-studio.genlayer.com/tx/0x557e834340988fabb041c9a596760899d5e5468f9702b66db02f547175a5bd5c) |
| complaint 0: a cold radiator | ok | [`0xfe1574a5...`](https://explorer-studio.genlayer.com/tx/0xfe1574a5fcd737ed50163928a3f05f58313d31ae9658b3f931ab9003a85aebc9) |
| complaint 1: music after midnight | ok | [`0xeae20057...`](https://explorer-studio.genlayer.com/tx/0xeae200570d36622d2fbe542b8866ee887c6c8b02218d9c45dd5c28a2b62ffe4b) |
| the same complaint again | refused: this complaint was already routed as complaint 0; that answer stands | [`0xf7dc8750...`](https://explorer-studio.genlayer.com/tx/0xf7dc8750b17d455a9b9b132cf010f2d5471c8e844d5d4634b496331da1d8c6a1) |
| complaint 2: a sponsorship request | ok | [`0x112a6969...`](https://explorer-studio.genlayer.com/tx/0x112a696996ee5048b6c4ccce1e88656587cc3d320589680a14e5ffda05eb6234) |
| a fourth complaint | refused: a complainant files at most 3 complaints on one desk | [`0x804e4511...`](https://explorer-studio.genlayer.com/tx/0x804e45114c0ed52c30d9e55321304f54a6a6f60a6c97dd0185d7575ca02b8188) |
| a stranger answers complaint 0 | refused: only the responder for category 0 may answer it | [`0x4b31a4cc...`](https://explorer-studio.genlayer.com/tx/0x4b31a4ccdad8e97944b3ab9ca1adf8e3087488665adae081e0db4cc6950ce08b) |
| repairs answers the out-of-scope request | refused: this complaint is out_of_scope; only an assigned one is answered | [`0x0de9c345...`](https://explorer-studio.genlayer.com/tx/0x0de9c345522c7df2c79a81310a982c2496da578e781cc4dbdc0b18441f618587) |
| repairs answers complaint 0 in time | ok | [`0xa0cb87b4...`](https://explorer-studio.genlayer.com/tx/0xa0cb87b41d1fb747d197ed7b813f0694b348eb886f798671d93c24cd5ca06f1e) |
| a breach recorded before the deadline | refused: the response is due by 2026-10-07T22:21:49Z | [`0xa34b2298...`](https://explorer-studio.genlayer.com/tx/0xa34b2298bddcb8fb7c5bc2cd547353cb8bf5f9fe0648bb6ebe5632d0e91eae1f) |
| neighbours answers after the deadline | refused: the response was due by 2026-10-07T22:21:49Z; anyone may now record the breach | [`0xd99b2cfa...`](https://explorer-studio.genlayer.com/tx/0xd99b2cfa261a940646ce350a7d3b26dd2da90c508e6b0714570b4b8492ce53b1) |
| complaint 1 breached | ok | [`0x5e38bb27...`](https://explorer-studio.genlayer.com/tx/0x5e38bb2744d550f031baa11f62374f2fcdf5da8ea6a790ec277d2b3f8f8c4bbd) |
| a breach of an answered complaint | refused: this complaint is answered; only an assigned one can be breached | [`0x964555fe...`](https://explorer-studio.genlayer.com/tx/0x964555fefd7407276480479e846199d10571102f5de25a770a4880058a5578b3) |

`tests/test_runbook.py::TestTheRecord` replays these routings through this repository's contract and fails unless it assigns, answers and breaches exactly as the deployed one did.
<!-- measured:deployment:end -->

On top of the record: `pnpm e2e:contract` asks the chain again for every transaction,
every category and every complaint and checks each against the record, and
`pnpm verify:contract` reads the deployed source back with `gen_getContractCode`,
compares it byte for byte with `packages/contracts/triage.py`, and runs
genvm-lint on the deployed bytes.

## Known limits

- Validators judge what a complaint is about, not whether it is true; and the contract records that an answer came in time, not whether it fixed anything.
- A category only routes what its wording covers; a kind of complaint nobody listed is out of scope.
- At most 6 categories, windows of 60 s to 90 days, three complaints per complainant per desk.
- StudioNet is a test network; its state can be reset.

## Path forward

- A satisfaction step: the complainant marks an answer as resolving the complaint or not, recorded beside it.
- A service-level contract that reads `categories_of` and pays or withholds a team's bonus by its breach count.
- Escalation: a breached complaint routed again to a second responder named at `open()`.
