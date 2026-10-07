"""
The shared vectors are the contract's own answers.

packages/shared/triage-vectors.json is what the TypeScript port in
packages/shared is tested against. If the vectors were hand-written, the port
could agree with them and disagree with the contract. So this test recomputes
every vector from the contract's functions and fails if any has drifted:
regenerate with `UPDATE_VECTORS=1 python -m pytest tests/test_vectors.py`.
"""

import json
import os
import pathlib

import glsim as S

M = S.load_contract("triage.py")
VECTORS = pathlib.Path(__file__).absolute().parent.parent.parent / "shared" / "triage-vectors.json"


def recompute(v):
    return {
        "clean_text": [{"raw": x["raw"], "clean": M.clean_text(x["raw"])} for x in v["clean_text"]],
        "split_list": [{"text": x["text"], "items": M.split_list(x["text"])} for x in v["split_list"]],
        "parse_windows": [{"text": x["text"], "windows": M.parse_windows(x["text"])} for x in v["parse_windows"]],
        "desk_refusal": [{"categories": x["categories"], "responders": x["responders"], "windows": x["windows"],
                          "refusal": M.desk_refusal(M.split_list(x["categories"]), M.split_list(x["responders"]),
                                                    M.parse_windows(x["windows"]))}
                         for x in v["desk_refusal"]],
        "normalise_choice": [{"raw": x["raw"], "n": x["n"], "choice": M.normalise_choice(x["raw"], x["n"])}
                             for x in v["normalise_choice"]],
        "unreverse": [{"choice": x["choice"], "n": x["n"], "back": M.unreverse(x["choice"], x["n"])}
                      for x in v["unreverse"]],
        "fold": [{"forward": x["forward"], "reverse": x["reverse"], "folded": M.fold(x["forward"], x["reverse"])}
                 for x in v["fold"]],
        "ruling_sound": [{"ruling": x["ruling"], "n": x["n"], "sound": M.ruling_sound(x["ruling"], x["n"])}
                         for x in v["ruling_sound"]],
    }


def test_every_shared_vector_is_what_the_contract_computes():
    stored = json.loads(VECTORS.read_text(encoding="utf-8"))
    fresh = recompute(stored)
    if os.environ.get("UPDATE_VECTORS"):
        VECTORS.write_text(json.dumps(fresh, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    assert stored == fresh, "triage-vectors.json has drifted from the contract; UPDATE_VECTORS=1"


def test_the_vectors_cover_every_outcome():
    v = json.loads(VECTORS.read_text(encoding="utf-8"))
    assert {x["choice"] for x in v["normalise_choice"]} >= {"", "none", "0", "2"}
    assert {x["folded"] for x in v["fold"]} == {"", "none", "0", "1"}
    assert {x["sound"] for x in v["ruling_sound"]} == {True, False}
    assert any(x["windows"] is None for x in v["parse_windows"]) and any(x["windows"] for x in v["parse_windows"])
    assert any(x["refusal"] == "" for x in v["desk_refusal"]) and len({x["refusal"] for x in v["desk_refusal"]}) >= 6
