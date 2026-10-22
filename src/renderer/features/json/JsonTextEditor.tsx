import { observeEditorTheme } from "../../app/editor-theme";
import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import type { Diagnostic, Range } from "../../../json/document";
export function JsonTextEditor({
  text,
  onChange,
  diagnostics,
  selection,
  readOnly,
  onSourceSelection,
}: {
  text: string;
  onChange: (text: string) => void;
  diagnostics: readonly Diagnostic[];
  selection: Range | null;
  readOnly: boolean;
  onSourceSelection?: (offset: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  const selected = useRef(onSourceSelection);
  useEffect(() => {
    selected.current = onSourceSelection;
  }, [onSourceSelection]);
  const initial = useRef(text);
  useEffect(() => {
    if (!host.current) return;
    const instance = monaco.editor.create(host.current, {
      value: initial.current,
      language: "json",
      automaticLayout: true,
      editContext: false,
      minimap: { enabled: false },
      ariaLabel: "JSON text editor",
      scrollBeyondLastLine: false,
      wordWrap: "off",
      autoClosingBrackets: "never",
      autoClosingQuotes: "never",
      autoSurround: "never",
    });
    editor.current = instance;
    const listener = instance.onDidChangeModelContent(() => changed.current(instance.getValue()));
    const cursor = instance.onDidChangeCursorPosition((event) => {
      const model = instance.getModel();
      if (event.source === "keyboard" || event.source === "mouse") {
        if (model) selected.current?.(model.getOffsetAt(event.position));
      }
    });
    const stopTheme = observeEditorTheme();
    return () => {
      stopTheme();
      cursor.dispose();
      listener.dispose();
      const model = instance.getModel();
      instance.dispose();
      model?.dispose();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = editor.current;
    if (instance && instance.getValue() !== text) instance.setValue(text);
  }, [text]);
  useEffect(() => {
    editor.current?.updateOptions({ readOnly });
  }, [readOnly]);
  useEffect(() => {
    const model = editor.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "rowberry-json",
      diagnostics.map((diagnostic) => {
        const start = model.getPositionAt(diagnostic.start),
          end = model.getPositionAt(Math.max(diagnostic.end, diagnostic.start + 1));
        return {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
          severity: monaco.MarkerSeverity.Error,
          message: diagnostic.message,
        };
      }),
    );
  }, [diagnostics, text]);
  useEffect(() => {
    const instance = editor.current,
      model = instance?.getModel();
    if (!instance || !model || !selection) return;
    const start = model.getPositionAt(selection.start),
      end = model.getPositionAt(selection.end);
    const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
    instance.setSelection(range);
    instance.revealRangeInCenterIfOutsideViewport(range);
  }, [selection]);
  return <div className="json-text-editor" ref={host} />;
}
