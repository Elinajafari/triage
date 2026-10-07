"""Mutation pass: break every defence on purpose, confirm a test notices.

Passing tests prove nothing on their own. Each entry below is a small edit to
the contract that removes a defence. The suite must fail for every one of them,
and this script records WHICH test caught it, so the table in the README is
measured rather than claimed.

    python scripts/mutate.py            # run them all, print what caught what
    python scripts/mutate.py --md       # emit the markdown table for the README

An escaping mutation is a finding, not a nuisance: either a missing test, or a
later defence strict enough that an earlier test can no longer fail. The script
exits non-zero if anything escapes, and refuses to run on a red baseline.

Three rules keep the harness honest:

  * the unmutated suite must be green before anything is mutated;
  * a find string that is missing, or matches more than once, is a failure of
    the harness, never a skip, so refactoring cannot quietly turn a row off;
  * scripts/lift.py runs inside every mutated copy before the suite, so the lib
    parity test can never stand in for the behavioural test a mutation deserves.
"""

import argparse
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).absolute().parent.parent
TARGET = "triage.py"

FENCE = '    return str(raw).replace("<", "(").replace(">", ")").replace("[", "(").replace("]", ")")'
ASSIGNED_IN_RESPOND = ('        if str(c.status) != ASSIGNED:\n'
                       '            raise gl.vm.UserError(f"{ERR_EXPECTED} this complaint is {c.status}; only an assigned one is answered")')
ASSIGNED_IN_BREACH = ('        if str(c.status) != ASSIGNED:\n'
                      '            raise gl.vm.UserError(f"{ERR_EXPECTED} this complaint is {c.status}; only an assigned one can be breached")')

MUTATIONS = [
    # -- the clock
    ("an answer after the deadline is accepted", "        if self._now() > int(c.due):", "        if False:"),
    ("an answer on the last second is refused", "        if self._now() > int(c.due):", "        if self._now() >= int(c.due):"),
    ("a breach is recorded before the deadline", "        if self._now() <= int(c.due):", "        if False:"),
    ("a breach is recorded on the deadline itself", "        if self._now() <= int(c.due):", "        if self._now() < int(c.due):"),
    ("the deadline ignores the category's window", "            due = now + int(cat.window)", "            due = now + 300"),
    ("the deadline is the filing time", "            due = now + int(cat.window)", "            due = now"),

    # -- who may write
    ("anyone may answer", "        if gl.message.sender_address != cat.responder:", "        if False:"),
    ("an out-of-scope complaint can be answered", ASSIGNED_IN_RESPOND,
     ASSIGNED_IN_RESPOND.replace("        if str(c.status) != ASSIGNED:", "        if False:", 1)),
    ("an answered complaint can be breached", ASSIGNED_IN_BREACH,
     ASSIGNED_IN_BREACH.replace("        if str(c.status) != ASSIGNED:", "        if False:", 1)),
    ("a complaint of another desk is reachable here",
     "        if i < 0 or i >= len(self.complaints) or int(self.complaints[i].desk_id) != int(desk_id):",
     "        if i < 0 or i >= len(self.complaints):"),

    # -- routing, in the deterministic half
    ("a routed complaint is out of scope", "            status = ASSIGNED", "            status = OUT_OF_SCOPE"),
    ("a routed complaint is not counted on its category", "            cat.assigned = u256(int(cat.assigned) + 1)", "            pass"),
    ("an answer is not counted", "        cat.answered = u256(int(cat.answered) + 1)", "        pass"),
    ("a breach is not counted", "        cat.breached = u256(int(cat.breached) + 1)", "        pass"),
    ("the breach is not marked", "        c.status = BREACHED", "        pass"),
    ("who recorded the breach is not kept", "        c.breached_by = gl.message.sender_address", "        pass"),
    ("the answer is not marked", "        c.status = ANSWERED", "        pass"),

    # -- filing limits, before the model
    ("a complainant files any number of complaints", "        if mine >= MAX_FILED:", "        if False:"),
    ("the filing count is not kept", "        self.filed[key] = u256(mine + 1)", "        pass"),
    ("a complaint is routed again", "        if seen > 0:", "        if False:"),
    ("a routed complaint is not remembered", '        self.decided[f"{did}:{h}"] = u256(cid + 1)', "        pass"),
    ("the decided wordings care about capitalisation", "        h = digest(body.lower())", "        h = digest(body)"),
    ("a complaint of any length is accepted",
     "        if len(body) < MIN_TEXT or len(body) > MAX_TEXT:\n            raise gl.vm.UserError(f\"{ERR_EXPECTED} a complaint is",
     "        if False:\n            raise gl.vm.UserError(f\"{ERR_EXPECTED} a complaint is"),
    ("an answer of any length is accepted",
     "        if len(body) < MIN_TEXT or len(body) > MAX_TEXT:\n            raise gl.vm.UserError(f\"{ERR_EXPECTED} an answer is",
     "        if False:\n            raise gl.vm.UserError(f\"{ERR_EXPECTED} an answer is"),
    ("complaints are not linked", "            why=sanitise_reason(res.get(\"because\", \"\")), prev=d.last_complaint,",
     "            why=sanitise_reason(res.get(\"because\", \"\")), prev=u256(0),"),

    # -- the two orders
    ("the reversed list is the frozen list", "        reversed_names = list(reversed(names))", "        reversed_names = list(names)"),
    ("the reversed answer is not read back", "fold(fwd, unreverse(rev, n))", "fold(fwd, rev)"),
    ("unreverse is the identity", "    return str(n - 1 - int(choice))", "    return choice"),
    ("a disagreement between the orders keeps the forward category",
     "    return forward if forward == reverse_unreversed else NONE", "    return forward"),
    ("a disagreement between the orders keeps the reverse category",
     "    return forward if forward == reverse_unreversed else NONE", "    return reverse_unreversed"),

    # -- reading the model
    ("a number outside the desk is accepted", "    if k < 0 or k >= n:", "    if False:"),
    ("an answer in words is read as a number",
     '    if s == "" or any(ch not in "0123456789" for ch in s) or len(s) > 2:', '    if s == "":'),
    ("an unusable answer is not retried", "    for _ in range(2):", "    for _ in range(1):"),
    ("a bare value is read as if it were an object", "        if isinstance(raw, dict):", "        if True:"),
    ("an unusable answer becomes out of scope",
     '    raise gl.vm.UserError(f"{ERR_LLM} the model named no category of the desk and did not say none")',
     '    return NONE, ""'),

    # -- the validator
    ("the validator agrees with a leader error",
     "                # An [LLM_ERROR] is never agreed with.\n                return False",
     "                # An [LLM_ERROR] is never agreed with.\n                return True"),
    ("the validator skips the free structural check", "            if not ruling_sound(proposed, n):", "            if False:"),
    ("the validator agrees with anything", '            return triage_agrees(again["category"], proposed, n)', "            return True"),
    ("agreement ignores the structural check",
     "    return ruling_sound(mine, n) and ruling_sound(theirs, n) and str(mine) == str(theirs)",
     "    return str(mine) == str(theirs)"),
    ("a category beyond the desk is sound", "    return int(s) < n", "    return True"),
    ("the agreed ruling is not checked again before it assigns", "        if not ruling_sound(choice, n):", "        if False:"),

    # -- the prompt boundary
    ("the fence does nothing", FENCE, "    return str(raw)"),
    ("the categories reach the prompt unfenced",
     '    rows = "\\n".join(f"[{k}] {fence(names[k])}" for k in range(n))',
     '    rows = "\\n".join(f"[{k}] {names[k]}" for k in range(n))'),
    ("the complaint reaches the prompt unfenced", "{fence(complaint)}", "{complaint}"),
    ("the desk name reaches the prompt unfenced", "{fence(desk)}", "{desk}"),
    ("the prompt no longer states how many categories there are",
     "Number of categories: {n}. Answer with one number from 0 to {n - 1}, or none.", "Answer carefully."),
    ("the prompt no longer scopes out requests",
     "A request, a suggestion or a question that\ndescribes no problem with what the desk covers is none.", ""),
    ("the prompt judges whether a complaint is justified",
     "Do not judge whether\nthe complaint is justified, polite or true, and do not judge how serious it is:\njudge only what it is about.",
     "Judge whether the complaint is justified."),
    ("the leader's reason is stored raw",
     '            why=sanitise_reason(res.get("because", "")), prev=d.last_complaint,',
     '            why=str(res.get("because", "")), prev=d.last_complaint,'),
    ("the leader's reason is not capped",
     '    return " ".join("".join(out).split())[:limit]', '    return " ".join("".join(out).split())'),

    # -- what open() accepts
    ("a desk name of any length is accepted", "        if len(nm) < MIN_NAME or len(nm) > MAX_NAME:", "        if False:"),
    ("the desk refusal is ignored", '        if refusal != "":', "        if False:"),
    ("an empty desk is accepted", '    if len(names) == 0 or (len(names) == 1 and names[0] == ""):', "    if False:"),
    ("more than six categories are accepted", "    if len(names) > MAX_CATEGORIES:", "    if False:"),
    ("a category of any length is accepted", "        if len(name) < MIN_CATEGORY or len(name) > MAX_CATEGORY:", "        if False:"),
    ("two categories with the same wording are accepted",
     "    if len(set(name.lower() for name in names)) != len(names):", "    if False:"),
    ("a missing responder is accepted",
     "    if len(responders) != len(names) or not all(looks_like_address(r) for r in responders):",
     "    if not all(looks_like_address(r) for r in responders):"),
    ("a responder that is not an address is accepted",
     "    if len(responders) != len(names) or not all(looks_like_address(r) for r in responders):",
     "    if len(responders) != len(names):"),
    ("a missing window is accepted", "    if windows is None or len(windows) != len(names):", "    if windows is None:"),
    ("a window of any length is accepted", "        if v < MIN_WINDOW or v > MAX_WINDOW:", "        if False:"),
    ("a missing category is dropped and the rest renumbered",
     '    return [clean_text(part) for part in str(text).split("|")]',
     '    return [clean_text(part) for part in str(text).split("|") if clean_text(part)]'),
    ("control characters are stored", '            out.append(" ")', "            out.append(ch)"),
]


PYTEST = [sys.executable, "-m", "pytest", "tests/", "-x", "-q", "--no-header", "-p", "no:cacheprovider"]


def copy_repo(tmp):
    dst = pathlib.Path(tmp) / "repo"
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns(
        "__pycache__", ".pytest_cache", ".git", "artifacts", "*.pyc", "node_modules", "deployments"))
    # tests/test_vectors.py and tests/test_shape.py read ../shared; a mutant
    # must face the same vectors and the same described surface.
    shared = pathlib.Path(tmp) / "shared"
    shared.mkdir()
    for name in ("triage-vectors.json", "contract-shape.json"):
        shutil.copy(ROOT.parent / "shared" / name, shared / name)
    return dst


def run_one(label, find, replace):
    with tempfile.TemporaryDirectory() as tmp:
        dst = copy_repo(tmp)
        target = dst / TARGET
        src = target.read_text(encoding="utf-8")
        hits = src.count(find)
        if hits == 0:
            return "PATTERN NOT FOUND", None
        if hits > 1:
            return "PATTERN NOT UNIQUE", None
        target.write_text(src.replace(find, replace, 1), encoding="utf-8", newline="\n")
        subprocess.run([sys.executable, "scripts/lift.py"], cwd=dst, capture_output=True)
        proc = subprocess.run(PYTEST, cwd=dst, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
        if proc.returncode == 0:
            return "ESCAPED", None
        text = proc.stdout + proc.stderr
        m = re.search(r"^(?:FAILED|ERROR) (\S+?)::(\S+?)(?:\[|\s|$)", text, re.M)
        if m:
            return "caught", m.group(2).split("::")[-1]
        m = re.search(r"^E\s+(\w*(?:Error|Exception))", text, re.M)
        if m:
            return "caught", m.group(1) + " at import"
        return "caught", "unnamed failure"


def baseline_is_green():
    with tempfile.TemporaryDirectory() as tmp:
        dst = copy_repo(tmp)
        proc = subprocess.run(PYTEST, cwd=dst, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
        return proc.returncode == 0, (proc.stdout + proc.stderr)[-2000:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", action="store_true", help="emit the README table")
    args = ap.parse_args()

    green, tail = baseline_is_green()
    if not green:
        print("the unmutated suite is not green; every mutation would look caught:\n" + tail, file=sys.stderr)
        return 2

    rows, escaped = [], []
    for label, find, replace in MUTATIONS:
        status, test = run_one(label, find, replace)
        if status == "caught":
            rows.append((label, test))
            if not args.md:
                print("  caught   %-70s %s" % (label, test), flush=True)
        else:
            escaped.append((label, status))
            print("  %-8s %s" % (status, label), file=sys.stderr, flush=True)

    if args.md:
        print("| Mutation | Caught by |")
        print("|---|---|")
        for label, test in rows:
            print("| %s | `%s` |" % (label, test))
    else:
        print()
        print("  %d mutations, %d caught, %d escaped" % (len(MUTATIONS), len(rows), len(escaped)))
    return 1 if escaped else 0


if __name__ == "__main__":
    sys.exit(main())
