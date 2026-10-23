import { copyText } from "../../app/clipboard";
import { Button } from "../../components/ui/button";
import { filterPaths } from "../../../json/viewer";
import { recordDraft } from "../../app/workspace";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  readOnly = false,
  title = "JSON viewer",
}: {
  readOnly?: boolean;
  title?: string;
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
  const [mode, setMode] = useState("tree");
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState("");
  const [treeAction, setTreeAction] = useState<{ kind: "collapse" | "expand"; token: number }>({
    kind: "collapse",
    token: 0,
  });
  const filteredPaths = useMemo(
    () => (filter.trim() ? filterPaths(state.matches.map((match) => match.path)) : null),
    [filter, state.matches],
  );
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
      if (width >= 340) element.style.width = `${Math.min(width, innerWidth - 40)}px`;
    } catch {
      /* Panel sizing remains usable when storage is unavailable. */
    }
    const parent = element.parentElement;
    const observer = new ResizeObserver(() => {
      parent?.style.setProperty("--json-panel-width", `${element.getBoundingClientRect().width}px`);
      try {
        localStorage.setItem(
          "rowberry-json-panel-width",
          String(element.getBoundingClientRect().width),
        );
      } catch {
        /* Optional preference only. */
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      parent?.style.removeProperty("--json-panel-width");
    };
  }, [expanded]);
  const [path, setPath] = useState("");
  const [valueKind, setValueKind] = useState("string");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  const dirty = originalSqlNull || state.text !== sourceText;
  useEffect(() => {
    recordDraft(
      `json:${documentId}`,
      "json",
      "JSON value (copy only; reopen and compare the current database value)",
      dirty ? state.text : null,
    );
  }, [documentId, dirty, state.text]);
  useEffect(() => {
    const discard = () => recordDraft(`json:${documentId}`, "json", "", null);
    window.addEventListener("rowberry:discard-json", discard);
    return () => window.removeEventListener("rowberry:discard-json", discard);
  }, [documentId]);
  const saveHelpId = useId();
  const editable = !readOnly && !!state.document?.editable && !state.pending && !saving;
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
    setStatus(
      copyText(text) ? "Copied" : "Clipboard unavailable. Select the text and copy manually.",
    );
  }

  return (
    <section
      className={`json-inspector ${expanded ? "json-expanded" : ""}`}
      ref={panel}
      data-dirty={dirty}
      aria-label="JSON inspector"
    >
      {!expanded && (
        <button
          className="json-resize"
          aria-label="Resize JSON panel"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId) || !panel.current) return;
            const right = panel.current.getBoundingClientRect().right;
            panel.current.style.width = `${Math.max(340, Math.min(innerWidth * 0.65, right - event.clientX))}px`;
          }}
          onKeyDown={(event) => {
            if (!panel.current || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            panel.current.style.width = `${Math.max(340, Math.min(innerWidth * 0.65, panel.current.clientWidth + (event.key === "ArrowLeft" ? 24 : -24)))}px`;
          }}
        />
      )}
      <header className="json-toolbar json-header">
        <strong>
          {title}
          {dirty ? " · unsaved draft" : ""}
        </strong>
        {!readOnly && (
          <button
            aria-pressed={editing}
            disabled={saving}
            onClick={() => {
              setEditing(!editing);
              if (!editing) setMode("split");
              else setMode("tree");
            }}
          >
            {editing ? "Done editing" : "Edit JSON"}
          </button>
        )}
        <details className="json-actions">
          <summary aria-label="JSON viewer actions">•••</summary>
          <div className="json-action-menu">
            <label>
              View{" "}
              <select
                aria-label="JSON view"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="tree">Tree</option>
                <option value="text">Text</option>
                <option value="split">Tree and text</option>
              </select>
            </label>
            <button onClick={() => copy(state.text)}>Copy JSON draft</button>
            <button onClick={() => copy(selected)}>Copy JSON pointer</button>
            <button
              onClick={() =>
                setTreeAction((action) => ({ kind: "expand", token: action.token + 1 }))
              }
            >
              Expand all
            </button>
            <button
              onClick={() =>
                setTreeAction((action) => ({ kind: "collapse", token: action.token + 1 }))
              }
            >
              Collapse all
            </button>
            <button onClick={() => setExpanded(!expanded)}>
              {expanded ? "Restore panel" : "Expand panel"}
            </button>
          </div>
        </details>
        <button
          aria-label="Close JSON"
          disabled={saving}
          onClick={() => (dirty ? setClosing(true) : onClose())}
        >
          ×
        </button>
      </header>
      <p className="json-caption">
        {readOnly
          ? "Selected row · read only · SQL NULL shown as null"
          : originalSqlNull
            ? "Creating JSON from SQL NULL · unsaved until confirmed"
            : saveTarget
              ? "Changes are saved after confirmation"
              : "Untargeted value · copy-only draft"}
      </p>
      <div className="json-save-bar">
        <div>
          <strong>
            {saving ? "Saving changes…" : dirty ? "Unsaved changes" : "No unsaved changes"}
          </strong>
          <p id={saveHelpId}>
            {readOnly
              ? "This result is read-only. Open the table to edit its values."
              : !saveTarget
                ? "Copy-only draft. Open this value from its table to save changes."
                : saveBlocked
                  ? "Resolve the pending table edit or save before saving JSON."
                  : !state.document?.editable
                    ? "Fix JSON errors before saving. Large values may be read-only."
                    : "Review your changes before updating the database."}
          </p>
        </div>
        <Button
          className="json-save"
          aria-describedby={saveHelpId}
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
        </Button>
      </div>
      <div className="json-toolbar" hidden={!editing}>
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
        <button disabled={saving || !dirty || state.pending} onClick={() => setClosing(true)}>
          Discard draft…
        </button>
      </div>
      {(state.pending || status) && (
        <output aria-live="polite">{state.pending ? "Parsing…" : status}</output>
      )}
      <JsonSearch
        onQueryChange={setFilter}
        revision={state.document?.revision ?? 0}
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
          {filter.trim() && !state.searching && !state.matches.length && (
            <p className="json-caption">No matching keys or values</p>
          )}
          {state.document?.root && (
            <JsonTree
              root={state.document.root}
              filter={filteredPaths}
              action={treeAction}
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
            readOnly={readOnly || !editing || saving || limited || !state.document}
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
      <div className="json-toolbar" hidden={!editing}>
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
      {editing && dirty && (
        <JsonChangePreview
          original={originalSqlNull ? "SQL NULL" : sourceText}
          draft={state.text}
        />
      )}
      {closing && (
        <div role="alertdialog" aria-label="Discard JSON draft">
          <p>Discard unsaved JSON changes? Copy the draft first if you need it.</p>
          <button
            onClick={() => {
              recordDraft(`json:${documentId}`, "json", "", null);
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
