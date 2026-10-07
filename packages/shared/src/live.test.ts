import { describe, expect, it } from "vitest";
import demo from "../../contracts/demo/demo.json";
import record from "../../contracts/deployments/studionet.json";
import shape from "../contract-shape.json";
import { parseCategories, parseComplaints, parseDesk } from "./index";

// The live deployment's own answers, as packages/contracts/scripts/seed.mjs
// read them back from studionet. If the contract ever returned a shape these
// parsers refuse, a client built on this package would break on real data;
// this is where that shows up first.

describe("the parsers accept everything the live deployment returned", () => {
  it("the desk, with exactly the fields the contract describes", () => {
    expect(Object.keys(parseDesk(record.desk)).sort()).toEqual(shape.views.desk.fields);
  });

  it("every category, in the frozen order, with its window", () => {
    const cats = parseCategories({ categories: record.categories });
    expect(cats.map((c) => c.text)).toEqual(demo.desk.categories);
    expect(cats.map((c) => c.window)).toEqual(demo.desk.windows);
  });

  it("every complaint, with exactly the fields the contract describes", () => {
    for (const c of parseComplaints({ complaints: record.complaints })) {
      expect(Object.keys(c).sort()).toEqual(shape.views.complaint.fields);
    }
  });

  it("each routed complaint's deadline is its filing time plus its category's window", () => {
    const windows = parseCategories({ categories: record.categories }).map((c) => c.window);
    for (const c of parseComplaints({ complaints: record.complaints })) {
      if (c.category === "none") continue;
      expect((Date.parse(c.due) - Date.parse(c.at)) / 1000).toBe(windows[Number(c.category)]);
    }
  });
});
