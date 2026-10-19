import { useState } from "react";
export function JsonChangePreview({ original, draft }: { original: string; draft: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="json-preview" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Preview changes · {original === draft ? "unchanged" : "modified"}</summary>
      {open && (
        <div>
          <section>
            <h3>Original source</h3>
            <pre>{original}</pre>
          </section>
          <section>
            <h3>Draft source</h3>
            <pre>{draft}</pre>
          </section>
        </div>
      )}
    </details>
  );
}
