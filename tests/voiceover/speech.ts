export function matchesSpeech(phrase: string, expected: readonly string[]): boolean {
  const normalized = phrase.toLowerCase().replace(/\s+/g, " ");
  return expected.every((part) => normalized.includes(part.toLowerCase()));
}

/** Require a changed phrase after the action; a pre-existing match is not evidence. */
export async function captureSpeech(options: {
  read: () => Promise<string>;
  action: () => Promise<void>;
  focused: () => Promise<boolean>;
  expected: string[];
  forbidden?: string[];
  timeoutMs?: number;
}) {
  if (!(await options.focused())) throw new Error("Test app lost foreground focus");
  const before = await options.read();
  const observations: string[] = [];
  let stopped = false;
  const deadline = Date.now() + (options.timeoutMs ?? 8000);
  async function listen() {
    while (!stopped && Date.now() < deadline) {
      if (!(await options.focused())) throw new Error("Test app lost foreground focus");
      const phrase = await options.read();
      if (!(await options.focused())) throw new Error("Test app lost foreground focus");
      if (phrase && phrase !== before && !observations.includes(phrase)) observations.push(phrase);
      if (phrase && phrase !== before) {
        if (options.forbidden?.some((part) => matchesSpeech(phrase, [part])))
          throw new Error(`Unexpected VoiceOver phrase: ${phrase}`);
        if (matchesSpeech(phrase, options.expected)) return { phrase, observations };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      `No fresh VoiceOver phrase matching ${JSON.stringify(options.expected)}; observed ${JSON.stringify(observations)}`,
    );
  }
  // Poll while native input and its DOM verification are still in flight.
  // Waiting for the action first can lose speech superseded by a later hint.
  const action = Promise.resolve().then(options.action);
  const listening = listen();
  try {
    const [, result] = await Promise.all([action, listening]);
    if (!(await options.focused())) throw new Error("Test app lost foreground focus");
    return result;
  } finally {
    stopped = true;
    // Finish outstanding input before the caller tears down the test app.
    await Promise.allSettled([action, listening]);
  }
}
