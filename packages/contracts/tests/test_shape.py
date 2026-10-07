"""
packages/shared/contract-shape.json is the contract's public surface.

Any client (the TypeScript types in packages/shared, a script, a bot) is
written against that file, so it must say exactly what the contract exposes:
every public write and view, its parameters and their types, and the fields a
view returns as the live deployment returned them. This test re-derives all
of it from the contract source and from deployments/studionet.json, and fails
on any drift in either direction.
"""

import ast
import json
import pathlib

import pytest

HERE = pathlib.Path(__file__).absolute().parent
PKG = HERE.parent
SHAPE = json.loads((PKG.parent / "shared" / "contract-shape.json").read_text(encoding="utf-8"))
SOURCE = (PKG / pathlib.Path(SHAPE["contract"]).name).read_text(encoding="utf-8")
RECORD = PKG / "deployments" / "studionet.json"


def surface():
    writes, views, ctor = {}, {}, {}
    for node in ast.walk(ast.parse(SOURCE)):
        if not isinstance(node, ast.FunctionDef):
            continue
        kinds = [ast.unparse(d) for d in node.decorator_list]
        params = {a.arg: (ast.unparse(a.annotation) if a.annotation else "") for a in node.args.args[1:]}
        if "gl.public.write" in kinds:
            writes[node.name] = {"params": params}
        elif "gl.public.view" in kinds:
            views[node.name] = {"params": params, "returns": ast.unparse(node.returns) if node.returns else "None"}
        elif node.name == "__init__":
            ctor = params
    return ctor, writes, views


def test_every_public_write_is_described_exactly():
    _, writes, _ = surface()
    assert writes == SHAPE["writes"]


def test_every_public_view_is_described_exactly():
    _, _, views = surface()
    described = {k: {"params": v["params"], "returns": v["returns"]} for k, v in SHAPE["views"].items()}
    assert views == described


def test_the_constructor_is_described_exactly():
    ctor, _, _ = surface()
    assert ctor == SHAPE["constructor"]


@pytest.mark.skipif(not RECORD.exists(), reason="no deployment recorded yet")
def test_the_fields_are_the_ones_the_live_deployment_returned():
    rec = json.loads(RECORD.read_text(encoding="utf-8"))
    for view, spec in SHAPE["views"].items():
        if "sampled_from_record" not in spec:
            continue
        obj = rec
        for step in spec["sampled_from_record"]:
            obj = obj[step]
        key = "fields" if "fields" in spec else "row_fields"
        assert sorted(obj.keys()) == spec[key], view
