import { describe, expect, it } from "vitest";
import vectors from "../triage-vectors.json";
import {
  cleanText,
  complaintRefusal,
  deskRefusal,
  fold,
  isBreachable,
  normaliseChoice,
  parseCategories,
  parseComplaint,
  parseComplaints,
  parseDesk,
  parseWindows,
  pyLen,
  rulingSound,
  splitList,
  unreverse,
} from "./index";

// triage-vectors.json is generated from the contract's own functions
// (see packages/contracts/tests/test_vectors.py), so every case below is the
// contract's answer, not a hand-written expectation.

describe("the port agrees with the contract on every vector", () => {
  it.each(vectors.clean_text)("clean_text %#", ({ raw, clean }) => expect(cleanText(raw)).toBe(clean));
  it.each(vectors.split_list)("split_list %#", ({ text, items }) => expect(splitList(text)).toEqual(items));
  it.each(vectors.parse_windows)("parse_windows %#", ({ text, windows }) => expect(parseWindows(text)).toEqual(windows));
  it.each(vectors.desk_refusal)("desk_refusal %#", ({ categories, responders, windows, refusal }) =>
    expect(deskRefusal(splitList(categories), splitList(responders), parseWindows(windows))).toBe(refusal));
  it.each(vectors.normalise_choice)("normalise_choice %#", ({ raw, n, choice }) => expect(normaliseChoice(raw, n)).toBe(choice));
  it.each(vectors.unreverse)("unreverse %#", ({ choice, n, back }) => expect(unreverse(choice, n)).toBe(back));
  it.each(vectors.fold)("fold %#", ({ forward, reverse, folded }) => expect(fold(forward, reverse)).toBe(folded));
  it.each(vectors.ruling_sound)("ruling_sound %#", ({ ruling, n, sound }) => expect(rulingSound(ruling, n)).toBe(sound));
});

describe("lengths are counted as the contract counts them", () => {
  it("a character outside the BMP is one character, as in Python", () => {
    expect(pyLen("🚚")).toBe(1);
    expect("🚚".length).toBe(2);
  });
  it("bounds a complaint", () => {
    expect(complaintRefusal("too short")).toContain("a complaint is 20 to 1200");
    expect(complaintRefusal("The radiator in my bedroom has been cold for a week.")).toBe("");
  });
});

describe("parsers refuse what the contract never returns", () => {
  const complaint = {
    id: 0, desk: 0, by: "0x" + "22".repeat(20), text: "a cold radiator", digest: "ab", at: "2026-10-08T12:00:00Z",
    category: "0", status: "assigned", due: "2026-10-08T12:05:00Z", answer: "", answered_at: "", breached_by: "",
    why: "", reason_is_leader_supplied: true,
  };
  it("parses a desk and its categories, from an object or a Map", () => {
    const d = { name: "Desk", owner: "0x" + "11".repeat(20), categories: 3, complaints: 2, opened_at: "t" };
    expect(parseDesk(d).categories).toBe(3);
    expect(parseDesk(new Map(Object.entries(d))).complaints).toBe(2);
    const c = { index: 0, desk: 0, text: "Repairs", responder: "0x" + "aa".repeat(20), window: 300, assigned: 1, answered: 1, breached: 0 };
    expect(parseCategories({ categories: [c] })[0].window).toBe(300);
    expect(() => parseCategories({})).toThrow("did not return a list");
  });
  it("parses complaints, and refuses a routing that is neither a category nor none", () => {
    expect(parseComplaints({ complaints: [complaint] })[0].category).toBe("0");
    expect(() => parseComplaint({ ...complaint, category: "repairs" })).toThrow("unexpected routing");
    expect(() => parseComplaint({ ...complaint, status: "closed" })).toThrow("unexpected status");
  });
  it("refuses a status that contradicts the routing or the deadline", () => {
    expect(() => parseComplaint({ ...complaint, status: "out_of_scope" })).toThrow();
    expect(() => parseComplaint({ ...complaint, category: "none" })).toThrow();
    expect(() => parseComplaint({ ...complaint, due: "" })).toThrow();
    expect(parseComplaint({ ...complaint, category: "none", status: "out_of_scope", due: "" }).status).toBe("out_of_scope");
  });
  it("tells when a breach may be recorded, with the clock the view does not have", () => {
    const c = parseComplaint(complaint);
    expect(isBreachable(c, new Date("2026-10-08T12:05:00Z"))).toBe(false);
    expect(isBreachable(c, new Date("2026-10-08T12:05:01Z"))).toBe(true);
    expect(isBreachable({ ...c, status: "answered" }, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });
});
