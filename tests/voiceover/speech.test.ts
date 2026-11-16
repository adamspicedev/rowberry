import { expect, it } from "vitest";
import { captureSpeech, matchesSpeech } from "./speech";

it("matches grouped native position numbers without accepting a different position or size", () => {
  expect(
    matchesSpeech("99,999: 99,999 selected. Outline row 100,000 of 100,000", [
      "99999",
      "100000 of 100000",
    ]),
  ).toBe(true);
  expect(matchesSpeech("Outline row 99,999 of 100,000", ["100000 of 100000"])).toBe(false);
  expect(matchesSpeech("Outline row 100,000 of 1,000,000", ["100000 of 100000"])).toBe(false);
  expect(matchesSpeech("Outline row 1,100,000 of 100,000", ["100000 of 100000"])).toBe(false);
});

it("treats punctuation in expected speech as literal text", () => {
  expect(matchesSpeech("A key [x.y]", ["[x.y]"])).toBe(true);
  expect(matchesSpeech("A key [xay]", ["[x.y]"])).toBe(false);
});

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
