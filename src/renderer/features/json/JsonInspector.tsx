import { useEffect, useRef, useState } from "react";
import type { JsonValue, Range } from "../../../json/document";
import { escapePointer } from "../../../json/paths";
import { resolvePointer } from "../../../json/document";
import { useJsonDocument } from "./json-state";
import { JsonTree } from "./JsonTree";
import { JsonTextEditor } from "./JsonTextEditor";
import { JsonSearch } from "./JsonSearch";
import { JsonChangePreview } from "./JsonChangePreview";
export type JsonSaveTarget = {
  target: string;
  column: string;
  sessionId: string;
  generation: number;
};
export type ValidatedJsonDraft = {
  documentId: string;
  text: string;
  originalSource: string;
  originalSqlNull?: boolean;
  revision: number;
  saveTarget: JsonSaveTarget;
};
export function JsonInspector({
  documentId,
  sourceText,
  originalSqlNull = false,
  saveTarget,
  onValidatedDraft,
  onClose,
  onDirtyChange,
  saving = false,
  saveBlocked = false,
  onSaveDraft,
}: {
  documentId: string;
  sourceText: string;
  originalSqlNull?: boolean;
  saveTarget?: JsonSaveTarget;
  onValidatedDraft?: (draft: ValidatedJsonDraft | null) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  saving?: boolean;
  saveBlocked?: boolean;
  onSaveDraft?: (draft: ValidatedJsonDraft) => void;
}) {
  const state = useJsonDocument(documentId, sourceText);
  const panel = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState("");
  const [reveal, setReveal] = useState({ path: "", token: 0 });
  const [selection, setSelection] = useState<Range | null>(null);
  const [mode, setMode] = useState("split");
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (expanded) {
      element.style.width = "auto";
      return;
    }
    try {
      const width = Number(localStorage.getItem("rowberry-json-panel-width"));
      if (width >= 440) element.style.width = `${Math.min(width, innerWidth - 40)}px`;
    } catch {
      /* Panel sizing remains usable when storage is unavailable. */
    }
    const observer = new ResizeObserver(() => {
      try {
        localStorage.setItem("rowberry-json-panel-width", String(element.clientWidth));
      } catch {
        /* Optional preference only. */
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);
  const [path, setPath] = useState("");
  const [valueKind, setValueKind] = useState("string");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  const dirty = originalSqlNull || state.text !== sourceText;
  const editable = !!state.document?.editable && !state.pending && !saving;
  const limited =
    state.document?.diagnostics.some((diagnostic) => diagnostic.kind === "limit") ?? false;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onValidatedDraft?.(
      editable && saveTarget && state.document
        ? {
            documentId,
            text: state.text,
            originalSource: sourceText,
            originalSqlNull,
            revision: state.document.revision,
            saveTarget,
          }
        : null,
    );
    return () => onValidatedDraft?.(null);
  }, [
    editable,
    saveTarget,
    state.document,
    state.text,
    documentId,
    sourceText,
    originalSqlNull,
    onValidatedDraft,
  ]);
  function typedValue(): JsonValue {
    switch (valueKind) {
      case "number":
        return { kind: "number", lexeme: value };
      case "boolean":
        return { kind: "boolean", value: value === "true" };
      case "null":
        return { kind: "null" };
      case "raw":
        return { kind: "raw", text: value };
      default:
        return { kind: "string", value };
    }
  }
  function copy(text: string) {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    try {
      setStatus(
        document.execCommand("copy")
          ? "Copied"
          : "Clipboard unavailable. Select the text and copy manually.",
      );
    } finally {
      input.remove();
    }
  }
  return (
    <section
      className={`json-inspector ${expanded ? "json-expanded" : ""}`}
      ref={panel}
      data-dirty={dirty}
      aria-label="JSON inspector"
    >
      <header className="json-toolbar">
        <strong>JSON {dirty ? "· unsaved draft" : ""}</strong>
        <span>
          {originalSqlNull
            ? "Creating JSON from SQL NULL · unsaved until confirmed"
            : saveTarget
              ? "Table draft · guarded database save"
              : "Untargeted value · copy-only draft"}
        </span>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? "Restore panel" : "Expand panel"}
        </button>
        <button disabled={saving} onClick={() => (dirty ? setClosing(true) : onClose())}>
          Close JSON
        </button>
      </header>
      <div className="json-toolbar">
        <label>
          View{" "}
          <select
            aria-label="JSON view"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="split">Tree and text</option>
            <option value="tree">Tree</option>
            <option value="text">Text</option>
          </select>
        </label>
        <button
          disabled={saving || state.pending || !state.document?.canUndo}
          onClick={() => state.mutate({ kind: "undo" })}
        >
          Undo JSON
        </button>
        <button
          disabled={saving || state.pending || !state.document?.canRedo}
          onClick={() => state.mutate({ kind: "redo" })}
        >
          Redo JSON
        </button>
        <button onClick={() => void copy(state.text)}>Copy JSON draft</button>
        <button onClick={() => void copy(selected)}>Copy JSON pointer</button>
        <button
          disabled={!state.document?.root || state.pending}
          onClick={() => {
            if (!state.document) return;
            const node = resolvePointer(state.document, selected);
            if (node) void copy(state.text.slice(node.start, node.end));
          }}
        >
          Copy selected value
        </button>
        <button
          disabled={!editable || !dirty || !saveTarget || !onSaveDraft || saveBlocked}
          onClick={() => {
            if (!editable || !state.document || !saveTarget || state.pending || saving) return;
            onSaveDraft?.({
              documentId,
              text: state.text,
              originalSource: sourceText,
              originalSqlNull,
              revision: state.document.revision,
              saveTarget,
            });
          }}
        >
          Save to database
        </button>
        <button disabled={saving || !dirty || state.pending} onClick={() => setClosing(true)}>
          Discard draft…
        </button>
        <output>{state.pending ? "Parsing…" : status}</output>
      </div>
      <JsonSearch
        search={state.search}
        matches={state.matches}
        searching={state.searching}
        cancel={state.cancelSearch}
        reveal={(match) => {
          setSelected(match.path);
          setPath(match.path);
          setReveal((request) => ({ path: match.path, token: request.token + 1 }));
          setSelection(match.range);
        }}
      />
      {state.error && <p role="alert">{state.error}</p>}
      {state.document?.diagnostics.map((diagnostic, index) => (
        <p role="alert" key={index}>
          {diagnostic.message}
          {diagnostic.kind === "duplicate"
            ? " · Duplicate keys: edit the source text to remove ambiguity before structural editing or saving."
            : ""}
        </p>
      ))}
      {state.document?.historyTruncated && (
        <p>Older undo states exceeded the history limit and are unavailable.</p>
      )}
      <div className="json-content">
        <div style={{ display: mode === "text" ? "none" : undefined }} className="json-tree-pane">
          {state.document?.root && (
            <JsonTree
              root={state.document.root}
              selected={selected}
              reveal={reveal}
              onSelect={(row) => {
                setSelected(row.path);
                setPath(row.path);
                setSelection(row.node);
              }}
            />
          )}
        </div>
        <div style={{ display: mode === "tree" ? "none" : undefined }} className="json-text-pane">
          <JsonTextEditor
            text={state.text}
            onChange={state.changeText}
            diagnostics={state.document?.diagnostics ?? []}
            selection={selection}
            readOnly={saving || limited || !state.document}
            onSourceSelection={(offset) => {
              if (!state.document?.root || state.pending) return;
              let node = state.document.root,
                pointer = "";
              for (;;) {
                const child =
                  node.kind === "object"
                    ? node.entries.find(
                        (entry) => entry.value.start <= offset && offset < entry.value.end,
                      )
                    : undefined;
                const index =
                  node.kind === "array"
                    ? node.children.findIndex(
                        (entry) => entry.start <= offset && offset < entry.end,
                      )
                    : -1;
                if (child) {
                  node = child.value;
                  pointer += "/" + escapePointer(child.key);
                } else if (node.kind === "array" && index >= 0) {
                  const next = node.children[index];
                  if (!next) break;
                  node = next;
                  pointer += "/" + index;
                } else break;
              }
              setSelected(pointer);
              setReveal((request) => ({ path: pointer, token: request.token + 1 }));
              setPath(pointer);
            }}
          />
        </div>
      </div>
      <div className="json-toolbar">
        <label>
          Pointer{" "}
          <input
            aria-label="JSON edit pointer"
            value={path}
            onChange={(event) => setPath(event.target.value)}
          />
        </label>
        <button
          disabled={!state.document?.root || state.pending}
          onClick={() => {
            if (!state.document) return;
            try {
              const node = resolvePointer(state.document, path);
              if (node) {
                setSelected(path);
                setReveal((request) => ({ path, token: request.token + 1 }));
                setSelection(node);
              } else setStatus("Pointer does not exist");
            } catch {
              setStatus("Invalid JSON pointer");
            }
          }}
        >
          Reveal pointer
        </button>
        <select
          aria-label="JSON value type"
          value={valueKind}
          onChange={(event) => setValueKind(event.target.value)}
        >
          <option value="string">String</option>
          <option value="number">Number (exact)</option>
          <option value="boolean">Boolean</option>
          <option value="null">JSON null</option>
          <option value="raw">JSON fragment</option>
        </select>
        {valueKind === "boolean" ? (
          <select
            aria-label="JSON new value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        ) : (
          <input
            aria-label="JSON new value"
            value={value}
            disabled={valueKind === "null"}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <button
          disabled={!editable}
          onClick={() => state.mutate({ kind: "set", path, value: typedValue() })}
        >
          Set value
        </button>
        <button
          disabled={!editable}
          onClick={() => state.mutate({ kind: "add", path, value: typedValue() })}
        >
          Add value
        </button>
        <button
          disabled={!editable || !path}
          onClick={() => state.mutate({ kind: "remove", path })}
        >
          Remove value
        </button>
        <button
          disabled={!editable || !selected || !path}
          onClick={() => state.mutate({ kind: "move", from: selected, path })}
        >
          Move selected to pointer
        </button>
      </div>
      <JsonChangePreview original={originalSqlNull ? "SQL NULL" : sourceText} draft={state.text} />
      {closing && (
        <div role="alertdialog" aria-label="Discard JSON draft">
          <p>Discard unsaved JSON changes? Copy the draft first if you need it.</p>
          <button
            onClick={() => {
              onDirtyChange?.(false);
              onClose();
            }}
          >
            Discard and close JSON
          </button>
          <button onClick={() => setClosing(false)}>Keep editing JSON</button>
        </div>
      )}
    </section>
  );
}
