"""The demo's data, loaded from demo/demo.json.

scripts/seed.mjs sends exactly these strings to StudioNet, and
tests/test_runbook.py replays them offline, so the demo on the explorer and the
demo the tests check cannot drift apart.

One desk with three categories. A resident files three complaints: a cold
radiator (repairs), a neighbour's music (noise), and a request to sponsor a
football team (no category). Repairs answers in time; noise does not, and the
breach is recorded once its window has run out.
"""

import json
import pathlib

_DATA = json.loads((pathlib.Path(__file__).absolute().parent.parent / "demo" / "demo.json").read_text(encoding="utf-8"))

NAME = _DATA["desk"]["name"]
CATEGORIES = _DATA["desk"]["categories"]
WINDOWS = _DATA["desk"]["windows"]

RADIATOR = _DATA["complaints"]["radiator"]
NOISE = _DATA["complaints"]["noise"]
SPONSOR = _DATA["complaints"]["sponsor"]
BILLING = _DATA["complaints"]["billing"]

ANSWER = _DATA["answers"]["radiator"]
LATE = _DATA["answers"]["late"]

# the category index (or "none") each filed complaint is expected to be routed to
EXPECTED_RULINGS = _DATA["expected_rulings"]


def joined(items):
    return "|".join(str(x) for x in items)
