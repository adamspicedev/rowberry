import { useEffect, useRef, useState } from "react";
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)}>Commands ⌘K</button>
      <dialog
        className="command-dialog"
        ref={dialog}
        aria-label="Workspace commands"
        onClose={() => setOpen(false)}
      >
        <h2>Workspace commands</h2>
        <button
          autoFocus
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => document.getElementById("schema-search")?.focus());
          }}
        >
          Find connection
        </button>
        <button
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => document.getElementById("appearance")?.focus());
          }}
        >
          Change appearance
        </button>
        <button onClick={() => setOpen(false)}>Close commands</button>
      </dialog>
    </>
  );
}
