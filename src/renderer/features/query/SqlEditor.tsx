import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/sql/register.js";
import "monaco-editor/features/suggest/register.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import type { Table } from "../../../shared/browse";
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
export interface SqlEditorHandle {
  text(): string;
  selected(): string;
}
export function SqlEditor({
  value,
  onChange,
  onReady,
  tables,
}: {
  value: string;
  onChange: (text: string) => void;
  onReady: (handle: SqlEditorHandle | null) => void;
  tables: Table[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  const initial = useRef(value);
  useEffect(() => {
    if (!host.current) return;
    const editor = monaco.editor.create(host.current, {
      value: initial.current,
      language: "sql",
      editContext: false,
      quickSuggestions: false,
      acceptSuggestionOnCommitCharacter: false,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      ariaLabel: "SQL editor",
      scrollBeyondLastLine: false,
    });
    onReady({
      text: () => editor.getValue(),
      selected: () => {
        const selection = editor.getSelection();
        return selection ? (editor.getModel()?.getValueInRange(selection) ?? "") : "";
      },
    });
    const listener = editor.onDidChangeModelContent(() => changed.current(editor.getValue()));
    return () => {
      listener.dispose();
      onReady(null);
      const model = editor.getModel();
      editor.dispose();
      model?.dispose();
    };
  }, [onReady]);
  useEffect(() => {
    const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    const provider = monaco.languages.registerCompletionItemProvider("sql", {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: tables.flatMap((table) => [
            {
              label: `${table.schema}.${table.name}`,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${quote(table.schema)}.${quote(table.name)}`,
              range,
            },
            ...table.columns.map((column) => ({
              label: column.name,
              detail: `${table.schema}.${table.name} · ${column.typeName}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: quote(column.name),
              range,
            })),
          ]),
        };
      },
    });
    return () => provider.dispose();
  }, [tables]);
  return <div className="sql-editor" ref={host} />;
}
