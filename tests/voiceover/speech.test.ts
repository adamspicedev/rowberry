import { expect, it } from "vitest";
import { captureSpeech } from "./speech";

it("does not accept a stale phrase that already matches", async () => {
  await expect(
    captureSpeech({
      read: async () => "items expanded",
      action: async () => {},
      focused: async () => true,
      expected: ["items", "expanded"],
      timeoutMs: 1,
    }),
  ).rejects.toThrow("No fresh");
});
it("accepts fresh VoiceOver output with variable whitespace and case", async () => {
  let phrase = "name Apple";
  const result = await captureSpeech({
    read: async () => phrase,
    action: async () => {
      phrase = "Items, ARRAY\n expanded";
    },
    focused: async () => true,
    expected: ["items", "array", "expanded"],
  });
  expect(result.phrase).toBe(phrase);
});
it("rejects the reported repeated labels even if expected words are present", async () => {
  let phrase = "name Apple";
  await expect(
    captureSpeech({
      read: async () => phrase,
      action: async () => {
        phrase = "items items expanded";
      },
      focused: async () => true,
      expected: ["items", "expanded"],
      forbidden: ["items items"],
    }),
  ).rejects.toThrow("Unexpected");
});
it("stops capture when the test app loses focus", async () => {
  let focused = true;
  await expect(
    captureSpeech({
      read: async () => "",
      action: async () => {
        focused = false;
      },
      focused: async () => focused,
      expected: ["items"],
    }),
  ).rejects.toThrow("lost foreground");
});
