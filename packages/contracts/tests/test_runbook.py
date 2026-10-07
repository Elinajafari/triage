"""
The demo, replayed offline.

scripts/seed.mjs puts the demo on StudioNet from demo/demo.json. This file
replays the same steps through the real contract in the simulator, so a demo
that could not succeed is caught before a transaction is spent on it.

When deployments/studionet.json exists, the replay goes further: it feeds the
simulator the routings the validators actually agreed on, and checks that this
repository's contract assigns, answers and breaches exactly as the deployed one
did and refuses exactly where it refused.

    pytest tests/test_runbook.py -v
"""

import hashlib
import json
import pathlib

import pytest

import glsim as S

CONTRACT_PATH = "triage.py"
M = S.load_contract(CONTRACT_PATH)
RECORD = pathlib.Path("deployments/studionet.json")

import demo as D  # noqa: E402

WHO = {"owner": "0x" + "a1" * 20, "resident": "0x" + "b2" * 20, "repairs": "0x" + "c3" * 20,
       "neighbours": "0x" + "d4" * 20, "billing": "0x" + "e5" * 20, "stranger": "0x" + "f6" * 20}
RESPONDERS = [WHO["repairs"], WHO["neighbours"], WHO["billing"]]
T0 = 1_790_000_000

OPEN = [D.NAME, D.joined(D.CATEGORIES), D.joined(RESPONDERS), D.joined(D.WINDOWS)]

# As scripts/seed.mjs sends them: who, method, arguments, expected outcome,
# and for the late steps the point on complaint 1's clock they wait for.
# Complaints are numbered as the contract numbers them: 0 the radiator, 1 the
# noise, 2 the sponsorship request.
STEPS = [
    ("owner", "open", OPEN, "ok"),
    ("resident", "file", [0, D.RADIATOR], "ok"),
    ("resident", "file", [0, D.NOISE], "ok"),
    ("resident", "file", [0, D.RADIATOR], "refused"),
    ("resident", "file", [0, D.SPONSOR], "ok"),
    ("resident", "file", [0, D.BILLING], "refused"),
    ("stranger", "respond", [0, 0, D.ANSWER], "refused"),
    ("repairs", "respond", [0, 2, D.ANSWER], "refused"),
    ("repairs", "respond", [0, 0, D.ANSWER], "ok"),
    ("stranger", "breach", [0, 1], "refused"),
    ("neighbours", "respond", [0, 1, D.LATE], "refused", "after_due"),
    ("stranger", "breach", [0, 1], "ok", "after_due"),
    ("stranger", "breach", [0, 0], "refused"),
]

# the routing each ok file step comes back with is EXPECTED_RULINGS, in order
FILED = [s[2][1] for s in STEPS if s[1] == "file" and s[3] == "ok"]


def replay(rulings):
    """Run STEPS. `rulings` are the category indices (or "none") the ok file
    steps come back with, in order."""
    c = S.deploy(CONTRACT_PATH)
    outcomes = []
    clock = T0
    queue = list(rulings)
    n = len(D.CATEGORIES)
    for step in STEPS:
        actor, method, args, expect = step[:4]
        when = step[4] if len(step) > 4 else ""
        clock += 30
        if when == "after_due":
            clock = max(clock, M.seconds(c.complaint(0, 1)["due"]) + 20)
        S.set_time(M.iso(clock))
        S.set_mocks()
        if method == "file" and expect == "ok":
            want = queue.pop(0)
            rev = "none" if want == "none" else str(n - 1 - int(want))
            S.set_mocks(leader_prompts={
                "<categories>\n[0] " + D.CATEGORIES[0]: {"category": want, "because": "replayed"},
                "<categories>\n[0] " + D.CATEGORIES[-1]: {"category": rev, "because": "replayed"}})
        S.set_sender(WHO[actor])
        try:
            S.call(c, method, *args)
            outcomes.append(("ok", ""))
        except S.UserError as e:
            outcomes.append(("refused", e.message))
    return c, outcomes


class TestDemoData:
    def test_every_string_the_demo_sends_passes_the_bounds(self):
        assert M.desk_refusal(M.split_list(D.joined(D.CATEGORIES)), RESPONDERS, M.parse_windows(D.joined(D.WINDOWS))) == ""
        assert M.MIN_NAME <= len(D.NAME) <= M.MAX_NAME
        for text in (D.RADIATOR, D.NOISE, D.SPONSOR, D.BILLING, D.ANSWER, D.LATE):
            assert M.MIN_TEXT <= len(M.clean_text(text)) <= M.MAX_TEXT

    def test_each_complaint_is_about_one_thing(self):
        assert "radiator" in D.RADIATOR and "heating" in D.CATEGORIES[0]
        assert "music" in D.NOISE and "Noise" in D.CATEGORIES[1]
        assert "sponsor" in D.SPONSOR and "football" in D.SPONSOR            # a request, no problem with the flats

    def test_the_window_outlasts_the_steps_meant_to_land_inside_it(self):
        """The repairs answer and the early breach follow the noise complaint by
        seven transactions; at up to 40 s each on StudioNet they land well
        inside its window."""
        assert D.WINDOWS[1] >= 7 * 40


class TestReplay:
    def test_the_demo_succeeds_and_refuses_exactly_where_it_says(self):
        _, outcomes = replay(D.EXPECTED_RULINGS)
        assert [o for o, _ in outcomes] == [s[3] for s in STEPS]

    def test_the_refusals_say_why(self):
        _, outcomes = replay(D.EXPECTED_RULINGS)
        msgs = [m for o, m in outcomes if o == "refused"]
        wants = ["already routed as complaint 0", "at most 3 complaints", "only the responder for category 0",
                 "this complaint is out_of_scope", "the response is due by", "the response was due by",
                 "this complaint is answered"]
        assert len(msgs) == len(wants)
        for msg, want in zip(msgs, wants):
            assert want in msg, (want, msg)

    def test_the_expected_rulings_answer_one_breach_one_and_scope_out_one(self):
        c, _ = replay(D.EXPECTED_RULINGS)
        assert [(r["category"], r["status"]) for r in c.complaints_of(0)["complaints"]] == [
            ("0", "answered"), ("1", "breached"), ("none", "out_of_scope")]
        assert [(x["assigned"], x["answered"], x["breached"]) for x in c.categories_of(0)["categories"]] == [
            (1, 1, 0), (1, 0, 1), (0, 0, 0)]


@pytest.mark.skipif(not RECORD.exists(), reason="no deployment recorded yet: pnpm deploy:contract && pnpm seed:contract")
class TestTheRecord:
    def _record(self):
        return json.loads(RECORD.read_text(encoding="utf-8"))

    def test_the_record_is_of_this_source(self):
        here = hashlib.sha256(pathlib.Path(CONTRACT_PATH).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
        assert self._record()["source_sha256"] == here, "the deployed contract is not this file; redeploy"

    def test_every_step_on_chain_did_what_the_demo_expected(self):
        steps = [s for s in self._record()["steps"] if s["step"] != "deploy"]
        assert [("ok" if s["ok"] else "refused") for s in steps] == [s[3] for s in STEPS]

    def test_this_contract_routes_and_counts_as_the_deployed_one_did(self):
        rec = self._record()
        c, outcomes = replay([r["category"] for r in rec["complaints"]])
        assert [o for o, _ in outcomes] == [s[3] for s in STEPS]
        assert [(r["category"], r["status"]) for r in c.complaints_of(0)["complaints"]] == \
            [(r["category"], r["status"]) for r in rec["complaints"]]
        assert [(x["assigned"], x["answered"], x["breached"]) for x in c.categories_of(0)["categories"]] == \
            [(x["assigned"], x["answered"], x["breached"]) for x in rec["categories"]]
