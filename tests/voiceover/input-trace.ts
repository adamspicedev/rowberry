import type { ElectronApplication, Page } from "@playwright/test";
import type { Event as ElectronEvent, Input } from "electron";

type TraceEntry = { time: number; kind: string; [key: string]: unknown };
type FocusSnapshot = { time: number; [key: string]: unknown };
export type CapturedInputTrace = {
  status: "captured";
  start: FocusSnapshot;
  end: FocusSnapshot;
  events: TraceEntry[];
  droppedEvents: number;
};
export type InputTraceLayer = CapturedInputTrace | { status: "unavailable"; error: string };
export type InputTraceReport = { native: InputTraceLayer; renderer: InputTraceLayer };
type TraceState = {
  start: () => void;
  stop: () => CapturedInputTrace;
  dispose: () => void;
};

/** Observe only this fixture window; never capture printable input or element values. */
export async function installInputTrace(app: ElectronApplication, page: Page) {
  const browserWindow = await app.browserWindow(page);
  const key = `__rowberryInputTrace_${crypto.randomUUID().replaceAll("-", "")}`;
  const configuration = {
    key,
    limit: 64,
    keys: [
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Escape",
      "Enter",
    ],
  };
  const installed = await Promise.allSettled([
    browserWindow.evaluate((window, configuration) => {
      const contents = window.webContents;
      const allowed = new Set(configuration.keys);
      let enabled = false;
      let events: TraceEntry[] = [];
      let droppedEvents = 0;
      let start: FocusSnapshot | undefined;
      const snapshot = (): FocusSnapshot => ({
        time: Date.now(),
        windowDestroyed: window.isDestroyed(),
        windowFocused: !window.isDestroyed() && window.isFocused(),
        webContentsDestroyed: contents.isDestroyed(),
        webContentsFocused: !contents.isDestroyed() && contents.isFocused(),
      });
      const record = (entry: Omit<TraceEntry, "time">) => {
        if (!enabled) return;
        if (events.length >= configuration.limit) {
          droppedEvents++;
          return;
        }
        events.push({ ...entry, time: Date.now() } as TraceEntry);
      };
      const input = (_event: ElectronEvent, input: Input) => {
        if (!allowed.has(input.key)) return;
        record({
          kind: "before-input-event",
          type: input.type,
          key: input.key,
          code: input.code,
          location: input.location,
          modifiers: input.modifiers.slice(0, 16),
          shift: input.shift,
          control: input.control,
          alt: input.alt,
          meta: input.meta,
          isAutoRepeat: input.isAutoRepeat,
          isComposing: input.isComposing,
        });
      };
      const windowFocus = () => record({ kind: "window-focus" });
      const windowBlur = () => record({ kind: "window-blur" });
      const contentsFocus = () => record({ kind: "web-contents-focus" });
      const contentsBlur = () => record({ kind: "web-contents-blur" });
      contents.on("before-input-event", input);
      window.on("focus", windowFocus);
      window.on("blur", windowBlur);
      contents.on("focus", contentsFocus);
      contents.on("blur", contentsBlur);
      const state: TraceState = {
        start() {
          events = [];
          droppedEvents = 0;
          start = snapshot();
          enabled = true;
        },
        stop() {
          enabled = false;
          if (!start) throw new Error("Native input trace was not started");
          return { status: "captured", start, end: snapshot(), events, droppedEvents };
        },
        dispose() {
          enabled = false;
          contents.removeListener("before-input-event", input);
          window.removeListener("focus", windowFocus);
          window.removeListener("blur", windowBlur);
          contents.removeListener("focus", contentsFocus);
          contents.removeListener("blur", contentsBlur);
          Reflect.deleteProperty(window, configuration.key);
        },
      };
      Object.defineProperty(window, configuration.key, { value: state, configurable: true });
    }, configuration),
    page.evaluate((configuration) => {
      const allowed = new Set(configuration.keys);
      let enabled = false;
      let events: TraceEntry[] = [];
      let droppedEvents = 0;
      let start: FocusSnapshot | undefined;
      const describe = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return null;
        return {
          tag: target.tagName.toLowerCase(),
          role: target.getAttribute("role")?.slice(0, 160) ?? null,
          id: target.getAttribute("id")?.slice(0, 160) ?? null,
          ariaLabel: target.getAttribute("aria-label")?.slice(0, 160) ?? null,
        };
      };
      const snapshot = (): FocusSnapshot => ({
        time: Date.now(),
        documentFocused: document.hasFocus(),
        activeElement: describe(document.activeElement),
      });
      const record = (entry: Omit<TraceEntry, "time">) => {
        if (!enabled) return;
        if (events.length >= configuration.limit) {
          droppedEvents++;
          return;
        }
        events.push({ ...entry, time: Date.now() } as TraceEntry);
      };
      const keyboard = (event: KeyboardEvent, phase: "capture" | "bubble") => {
        if (!allowed.has(event.key)) return;
        record({
          kind: event.type,
          phase,
          key: event.key,
          code: event.code,
          location: event.location,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
          isTrusted: event.isTrusted,
          defaultPrevented: event.defaultPrevented,
          target: describe(event.target),
          activeElement: describe(document.activeElement),
        });
      };
      const capture = (event: KeyboardEvent) => keyboard(event, "capture");
      const bubble = (event: KeyboardEvent) => keyboard(event, "bubble");
      const focus = (event: FocusEvent) =>
        record({
          kind: event.type,
          target: describe(event.target),
          relatedTarget: describe(event.relatedTarget),
          activeElement: describe(document.activeElement),
        });
      for (const type of ["keydown", "keyup"] as const) {
        window.addEventListener(type, capture, true);
        window.addEventListener(type, bubble);
      }
      window.addEventListener("focusin", focus, true);
      window.addEventListener("focusout", focus, true);
      const state: TraceState = {
        start() {
          events = [];
          droppedEvents = 0;
          start = snapshot();
          enabled = true;
        },
        stop() {
          enabled = false;
          if (!start) throw new Error("Renderer input trace was not started");
          return { status: "captured", start, end: snapshot(), events, droppedEvents };
        },
        dispose() {
          enabled = false;
          for (const type of ["keydown", "keyup"] as const) {
            window.removeEventListener(type, capture, true);
            window.removeEventListener(type, bubble);
          }
          window.removeEventListener("focusin", focus, true);
          window.removeEventListener("focusout", focus, true);
          Reflect.deleteProperty(window, configuration.key);
        },
      };
      Object.defineProperty(window, configuration.key, { value: state, configurable: true });
    }, configuration),
  ]);
  const native = (method: keyof TraceState) =>
    browserWindow.evaluate(
      (window, { key, method }) => {
        const state = Reflect.get(window, key) as TraceState | undefined;
        if (!state) throw new Error("Native input trace unavailable");
        return state[method]();
      },
      { key, method },
    );
  const renderer = (method: keyof TraceState) =>
    page.evaluate(
      ({ key, method }) => {
        const state = Reflect.get(window, key) as TraceState | undefined;
        if (!state) throw new Error("Renderer input trace unavailable");
        return state[method]();
      },
      { key, method },
    );
  const errorText = (error: unknown) => String(error).slice(0, 1000);
  let startErrors = installed.map((result) =>
    result.status === "rejected" ? errorText(result.reason) : undefined,
  );
  let disposed = false;
  return {
    async start() {
      if (disposed) return;
      const results = await Promise.allSettled([native("start"), renderer("start")]);
      startErrors = results.map((result) =>
        result.status === "rejected" ? errorText(result.reason) : undefined,
      );
    },
    async stop(): Promise<InputTraceReport> {
      if (disposed)
        return {
          native: { status: "unavailable", error: "Input trace disposed" },
          renderer: { status: "unavailable", error: "Input trace disposed" },
        };
      const results = await Promise.allSettled([
        startErrors[0] ? Promise.reject(new Error(startErrors[0])) : native("stop"),
        startErrors[1] ? Promise.reject(new Error(startErrors[1])) : renderer("stop"),
      ]);
      const layer = (result: (typeof results)[number]): InputTraceLayer =>
        result.status === "fulfilled"
          ? (result.value as CapturedInputTrace)
          : { status: "unavailable", error: errorText(result.reason) };
      return { native: layer(results[0]!), renderer: layer(results[1]!) };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await Promise.allSettled([native("dispose"), renderer("dispose")]);
      await browserWindow.dispose().catch(() => {});
    },
  };
}
