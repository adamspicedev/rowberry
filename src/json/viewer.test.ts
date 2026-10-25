import { expect, it } from "vitest";
import { rowJson, filterPaths, jsonStringPreview } from "./viewer";
it("embeds JSON losslessly while keeping SQL text and null distinct", () => {
  expect(
    rowJson([
      { name: "id", text: "12345678901234567890", typeOid: 20 },
      { name: "doc", text: '{"n":12345678901234567890}', typeOid: 114 },
      { name: "absent", text: null, typeOid: 25 },
      { name: "__proto__", text: "safe", typeOid: 25 },
    ]),
  ).toBe(
    '{\n  "id": "12345678901234567890",\n  "doc": {"n":12345678901234567890},\n  "absent": null,\n  "__proto__": "safe"\n}',
  );
});
it("retains duplicate SQL column names without producing ambiguous JSON keys", () => {
  const text = rowJson(["id", "id", "id (2)"].map((name) => ({ name, text: name, typeOid: 25 })));
  expect(Object.values(JSON.parse(text))).toEqual(["id", "id", "id (2)"]);
});
it("filters by exact pointer ancestors including escaped keys", () => {
  expect([...filterPaths(["/profile/a~1b~0c", "/items/12"])]).toEqual([
    "",
    "/profile",
    "/profile/a~1b~0c",
    "/items",
    "/items/12",
  ]);
});

it("preserves escaped and Unicode preview prefixes without serializing large values", () => {
  const values = [
    "",
    "short",
    "x".repeat(10000000),
    '\\"\n\t'.repeat(200),
    "x".repeat(158) + "🍓tail",
    "x".repeat(159) + "🍓tail",
    "x".repeat(160) + "🍓tail",
    "\ud800".repeat(200),
  ];
  for (const value of values)
    expect(jsonStringPreview(value)).toBe(JSON.stringify(value).slice(0, 160));
});
