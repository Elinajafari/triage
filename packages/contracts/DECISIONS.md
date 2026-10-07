# DECISIONS

Why Triage is built the way it is. Each section names the alternative that was
rejected and what it would have cost.

## The routing and the promises exist before the first complaint

The obvious design asks a model "who should handle this complaint, and how
fast?". That hands it the whole service promise, with nothing frozen to judge
against, and makes the response time whatever the model thinks is reasonable
for the complaint in front of it. So whoever opens a desk writes its
categories, the account that answers each, and each response window, and they
never change. A category written after a complaint arrived could be written to
send it nowhere, and a window chosen afterwards would be a negotiation.

## The answer is an index, or none

What crosses consensus is the index of one category of the frozen desk, or
`none`: the coarsest answer that still carries the judgment. The validator can
check its shape for free, and two nodes that agree on it cannot assign the
complaint to different people or deadlines, because the responder and the
window come from storage, not from the model. The model never names a person
or a time.

## Order-dependence is none, not a guess

The categories are asked in their frozen order and then reversed. The same
category both ways stands; anything else is `none`, which is out of scope.
Forgiving a mismatch would let one node's reading of "mainly about" start a
clock another node would not have started. A complainant whose complaint is
order-dependent can file once more, described so its category is clear.

## A request is not a complaint

The prompt says so: a request, a suggestion or a question that describes no
problem with what the desk covers is none. A desk that turns every message into
a ticket with a deadline is a desk nobody can keep. The demo's third complaint
(sponsor my son's football team) is written to test exactly that, and the
prompt also tells the model not to judge whether a complaint is justified,
polite or true, only what it is about.

## Routing happens when the complaint is filed

There is no "pending" complaint waiting for a ruling. Filing and routing are
one transaction, so the complaint is on the record with the chain's time and,
if it fits a category, its deadline is already running. Nothing can be ruled
late, because nothing is ever ruled after it is filed.

## Every waiting state has a clock

An assigned complaint waits only for its responder, and only until its
deadline. On the deadline itself the responder may still answer; one second
later it may not, and anyone may record the breach. Without that, a responder
could answer a week late and the record would show only "answered". Both edges
are tested on their exact second.

## breach() is anyone's

It adds no text, reads no model and decides nothing: it records what the clock
already implies. Leaving it open means a responder who vanishes cannot keep a
complaint open, and the owner, who might prefer not to see a breach recorded
against their own team, cannot stop it.

## There is no owner power

`open()` records its caller as the owner, and that is all the owner is: there
is no reassign, close, delete or override, and a static test checks nothing
ever compares a caller with it. An owner who could move a complaint would be
the triage desk this contract replaces.

## Three complaints per complainant, and each wording routed once

A routing is a consensus over model output, so re-filing is re-rolling. Three
complaints per complainant per desk leave room for real problems and none for
flooding, and a wording already routed on a desk, by anyone, in any spacing or
case, is refused: the routing stands.

## A parse failure is an error, never a routing

An unusable answer is retried once inside the block, then raised as
`[LLM_ERROR]`, which validators never agree with. Reading it as `none` would let
a broken model put every complaint out of scope.

## The agreed routing is checked twice

The validator refuses a routing outside the desk. The deterministic half checks
it again before anyone is assigned. No public call can reach that second check
while the first is intact, so it is kept in place by a static test rather than
a behavioural one, and the mutation table records that.

## Tagging untrusted text is not a fence

The desk's name, its categories and every complaint are written by someone with
a stake in the answer. A complaint could close its own block and list a new
category. `fence()` replaces `< > [ ]` at the prompt boundary only, and the
contract numbers the categories itself, after fencing. Text is stored verbatim.

## Why the tests are built the way they are

- **Each node gets its own answers**, and a leader can lie, so every validator check is reachable, and the free layer is measured at zero prompts.
- **The clock is moved by the tests**, so a deadline is tested at the second it falls and the second after.
- **The runbook is a test.** The demo is replayed offline before a transaction is spent; once `deployments/studionet.json` exists, the recorded routings are replayed through this contract, which must assign, answer and breach exactly as the deployed one did.
- **Mutation testing.** `scripts/mutate.py` removes each defence and names the test that caught it.

## GenVM constraints this contract obeys

- the runner is pinned (`py-genlayer:1jb45aa8...`), never `test` or `latest`
- the class is named after the product, because `genvm-lint validate` does not see a class named `Contract`
- no `int`, `list`, `dict` or `tuple` as a storage type, and no collection inside a storage dataclass; categories are contiguous rows, complaints are linked
- every persistent field is declared in the class body, and every stored field is read somewhere
- the block returns a flat dict of strings
- the clock is `gl.message_raw["datetime"]`, converted with integer arithmetic
- the file is pure ASCII
- `genvm-lint` validates against GenVM `v0.3.0-rc7`, the release that ships the pinned runner; `scripts/verify.mjs` sets `GENVM_VERSION` accordingly

## Not upgradable

There is no owner power and no admin method. The promises a complaint was filed
under are the promises it is held to.

## Success is read from the leader's result, not from ACCEPTED

A refusal is agreed on too: when `respond()` raises "only the responder for
category 0 may answer it", the committee accepts that the contract raised it.
A script that treats `ACCEPTED` as success reports a refused write as done.
`scripts/lib.mjs` (`outcome()`) and `scripts/evidence.mjs` read
`consensus_data.leader_receipt[0].result.status` instead: `return` is success,
and a `rollback` carries the contract's own sentence, which is recorded as it
was raised. The shape was measured on studionet with genlayer-js 1.1.8.

## Every role is its own wallet, made in memory

`deploy.mjs` and `seed.mjs` make the deployer, the owner, the resident, the
three responders and the stranger with `generatePrivateKey()` for the run and
never write them anywhere, so on the explorer each role is a different address
and every refusal comes from the account it is about. The billing responder is
named in the desk and never has to act. StudioNet is gasless, so none of them
holds anything, and a key that is never on disk cannot leak from a repository.
On a funded network the scripts refuse to run without keys from the environment.

## The breach waits for the chain's clock, with a margin

The contract decides a breach by the transaction's own time. The seed script
reads the noise complaint's deadline from the chain and sends the late answer
and the breach only once the local clock is 20 seconds past it, so the one
breach meant to land is never recorded as an early refusal because two clocks
disagreed by a few seconds.
