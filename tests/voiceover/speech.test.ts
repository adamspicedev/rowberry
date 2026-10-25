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

it("captures speech while an action is still awaiting completion", async () => {
  let phrase = "collapsed";
  let observed: () => void = () => {};
  const heard = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const result = await captureSpeech({
    read: async () => {
      const current = phrase;
      if (current === "items expanded") observed();
      return current;
    },
    action: async () => {
      phrase = "items expanded";
      await heard;
      phrase = "You are currently on a table";
    },
    focused: async () => true,
    expected: ["items", "expanded"],
  });
  expect(result.phrase).toBe("items expanded");
  expect(phrase).toBe("You are currently on a table");
});

it("does not turn matching speech into a pass when the action fails", async () => {
  let phrase = "collapsed";
  await expect(
    captureSpeech({
      read: async () => phrase,
      action: async () => {
        phrase = "items expanded";
        throw new Error("Native input failed");
      },
      focused: async () => true,
      expected: ["items", "expanded"],
    }),
  ).rejects.toThrow("Native input failed");
});
