import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { listDesigns, loadDesign } from "../src/designs.js";

describe("every saved design passes every check", () => {
  for (const name of listDesigns()) it(name, () => expect(checkDesign(loadDesign(name))).toEqual([]), 60_000);
});
