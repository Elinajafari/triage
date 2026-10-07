/**
 * Types and pure rules shared by the Triage contract (packages/contracts/triage.py)
 * and any client that reads it: a script, a bot, another app.
 *
 * Two kinds of thing live here:
 *
 *   1. The SHAPE of what the contract's views return, with parsers that
 *      refuse anything else. genlayer-js 1.1.8 returns plain objects with
 *      number fields (measured on studionet); older builds returned Map, so
 *      the parsers accept both.
 *
 *   2. A PORT of the contract's deterministic rules: how caller text is
 *      cleaned, how a pipe-joined desk is read and refused, how a model's
 *      answer is read, and how the two presentation orders fold into one
 *      routing. A port that disagrees with the contract is worse than none,
 *      so it is tested against triage-vectors.json, which is generated FROM
 *      the contract's own functions and read by its Python tests too.
 */

// ---------------------------------------------------------------- tokens

export const NONE = "none" as const;
export const STATUSES = ["out_of_scope", "assigned", "answered", "breached"] as const;
export type Status = (typeof STATUSES)[number];
/** The category index a complaint was routed to, or "none". */
export type Routing = string;

export const EXPECTED = "[EXPECTED]";
export const MAX_CATEGORIES = 6;
export const MIN_CATEGORY = 8;
export const MAX_CATEGORY = 160;
export const MIN_NAME = 2;
export const MAX_NAME = 80;
export const MIN_TEXT = 20;
export const MAX_TEXT = 1200;
export const MAX_FILED = 3;
export const MIN_WINDOW = 60;
export const MAX_WINDOW = 90 * 86400;

// ---------------------------------------------------------------- shapes

export interface Desk {
  name: string;
  /** the caller of open(); has no power over complaints */
  owner: string;
  categories: number;
  complaints: number;
  opened_at: string;
}

export interface Category {
  index: number;
  desk: number;
  text: string;
  responder: string;
  /** seconds the responder has to answer */
  window: number;
  assigned: number;
  answered: number;
  breached: number;
}

export interface Complaint {
  id: number;
  desk: number;
  by: string;
  text: string;
  digest: string;
  at: string;
  category: Routing;
  status: Status;
  /** "" when out of scope */
  due: string;
  answer: string;
  answered_at: string;
  breached_by: string;
  /** leader-supplied and NOT part of consensus */
  why: string;
  reason_is_leader_supplied: boolean;
}

type Raw = Record<string, unknown>;

function record(v: unknown): Raw | null {
  if (v instanceof Map) return Object.fromEntries(v.entries()) as Raw;
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Raw;
  return null;
}

function num(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`expected a number, got ${String(v)}`);
  return n;
}

function str(v: unknown): string {
  if (typeof v !== "string") throw new Error(`expected a string, got ${typeof v}`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], what: string): T {
  const s = str(v);
  if (!(allowed as readonly string[]).includes(s)) throw new Error(`unexpected ${what}: ${s}`);
  return s as T;
}

function list(v: unknown, key: string, view: string): unknown[] {
  const r = record(v);
  const rows = r ? r[key] : null;
  if (!Array.isArray(rows)) throw new Error(`${view} did not return a list`);
  return rows;
}

export function parseDesk(v: unknown): Desk {
  const r = record(v);
  if (!r) throw new Error("desk is not an object");
  return { name: str(r.name), owner: str(r.owner), categories: num(r.categories), complaints: num(r.complaints),
    opened_at: str(r.opened_at) };
}

export function parseCategories(v: unknown): Category[] {
  return list(v, "categories", "categories_of").map((row) => {
    const c = record(row);
    if (!c) throw new Error("category is not an object");
    return {
      index: num(c.index), desk: num(c.desk), text: str(c.text), responder: str(c.responder), window: num(c.window),
      assigned: num(c.assigned), answered: num(c.answered), breached: num(c.breached),
    };
  });
}

export function parseComplaint(v: unknown): Complaint {
  const c = record(v);
  if (!c) throw new Error("complaint is not an object");
  const status = oneOf(c.status, STATUSES, "status");
  const category = str(c.category);
  if (!(category === NONE || /^\d{1,2}$/.test(category))) throw new Error(`unexpected routing: ${category}`);
  // out of scope <-> routed none; every other status has a category and a deadline
  if ((status === "out_of_scope") !== (category === NONE)) throw new Error(`a ${status} complaint routed ${category}`);
  const due = str(c.due);
  if ((status === "out_of_scope") !== (due === "")) throw new Error(`a ${status} complaint with due "${due}"`);
  return {
    id: num(c.id), desk: num(c.desk), by: str(c.by), text: str(c.text), digest: str(c.digest), at: str(c.at),
    category, status, due, answer: str(c.answer), answered_at: str(c.answered_at), breached_by: str(c.breached_by),
    why: str(c.why), reason_is_leader_supplied: Boolean(c.reason_is_leader_supplied),
  };
}

export function parseComplaints(v: unknown): Complaint[] {
  return list(v, "complaints", "complaints_of").map(parseComplaint);
}

/** Whether anyone may record a breach of this complaint at `now`. A view has
 * no clock, so the caller brings one; the contract applies the same rule to
 * the chain's clock when breach() is sent. */
export function isBreachable(complaint: Complaint, now: Date): boolean {
  return complaint.status === "assigned" && now.getTime() > Date.parse(complaint.due);
}

// ---------------------------------------------------------------- the port

/** Python's str.split() whitespace, as far as cleaned text can contain it:
 * JavaScript's \s plus NEL (U+0085), which Python splits on and \s does not. */
const PY_WS = /[\s\u0085]+/;

/** The contract's clean_text: control characters become spaces, whitespace
 * collapses, nothing is truncated. */
export function cleanText(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const o = ch.codePointAt(0) ?? 0;
    out += o < 32 || o === 127 ? " " : ch;
  }
  return out.split(PY_WS).filter(Boolean).join(" ");
}

/** Pipe-joined items, cleaned. Empty items are KEPT. */
export function splitList(text: string): string[] {
  return text.split("|").map(cleanText);
}

/** Length as Python's len() counts it: code points, not UTF-16 units. */
export function pyLen(s: string): number {
  return [...s].length;
}

function looksLikeAddress(raw: string): boolean {
  return /^0[xX][0-9a-fA-F]{40}$/.test(raw.trim());
}

/** Pipe-joined whole seconds, each MIN_WINDOW..MAX_WINDOW, or null. */
export function parseWindows(text: string): number[] | null {
  const out: number[] = [];
  for (const part of splitList(text)) {
    if (part === "" || part.length > 9 || !/^[0-9]+$/.test(part)) return null;
    const v = Number(part);
    if (v < MIN_WINDOW || v > MAX_WINDOW) return null;
    out.push(v);
  }
  return out;
}

/** The contract's desk_refusal: why a desk would be refused, or "". */
export function deskRefusal(names: string[], responders: string[], windows: number[] | null): string {
  if (names.length === 0 || (names.length === 1 && names[0] === "")) return `${EXPECTED} a desk needs at least one category`;
  if (names.length > MAX_CATEGORIES) return `${EXPECTED} a desk lists at most ${MAX_CATEGORIES} categories`;
  for (const n of names) {
    if (pyLen(n) < MIN_CATEGORY || pyLen(n) > MAX_CATEGORY) return `${EXPECTED} a category is ${MIN_CATEGORY} to ${MAX_CATEGORY} characters`;
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return `${EXPECTED} two categories with the same wording cannot be told apart`;
  }
  if (responders.length !== names.length || !responders.every(looksLikeAddress)) {
    return `${EXPECTED} give one responder address per category, pipe joined`;
  }
  if (windows === null || windows.length !== names.length) {
    return `${EXPECTED} give one response window per category, pipe joined, each ${MIN_WINDOW} to ${MAX_WINDOW} seconds`;
  }
  return "";
}

/** Python's str.strip(chars): remove any of `chars` from both ends. */
function stripChars(s: string, chars: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

/** A model's answer as a category number 0..n-1, "none", or "" if it is neither. */
export function normaliseChoice(raw: string, n: number): string {
  const s = stripChars(raw.trim().toLowerCase(), "[]()#").trim();
  if (s === NONE) return NONE;
  if (s === "" || s.length > 2 || !/^[0-9]+$/.test(s)) return "";
  const k = Number(s);
  if (k < 0 || k >= n) return "";
  return String(k);
}

/** A category number from the reversed list, back into the frozen list. */
export function unreverse(choice: string, n: number): string {
  if (choice === NONE || choice === "") return choice;
  return String(n - 1 - Number(choice));
}

/** Both orders into one routing. The same category stands; anything else is none. */
export function fold(forward: string, reverseUnreversed: string): string {
  if (forward === "" || reverseUnreversed === "") return "";
  return forward === reverseUnreversed ? forward : NONE;
}

/** The validator's free check: none, or a category of the desk. */
export function rulingSound(ruling: string, n: number): boolean {
  if (ruling === NONE) return true;
  if (ruling === "" || !/^[0-9]+$/.test(ruling)) return false;
  return Number(ruling) < n;
}

/** Why file() would refuse this text's length, or "". (It also refuses a
 * fourth complaint and a wording already routed, which only the chain knows.) */
export function complaintRefusal(text: string): string {
  const body = cleanText(text);
  if (pyLen(body) < MIN_TEXT || pyLen(body) > MAX_TEXT) return `${EXPECTED} a complaint is ${MIN_TEXT} to ${MAX_TEXT} characters`;
  return "";
}
