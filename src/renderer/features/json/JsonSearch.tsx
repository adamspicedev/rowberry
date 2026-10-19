import { useState } from "react";
import type { SearchMatch } from "../../../json/search";
export function JsonSearch({
  search,
  matches,
  searching,
  reveal,
  cancel,
}: {
  search: (query: string) => void;
  matches: SearchMatch[];
  searching: boolean;
  cancel: () => void;
  reveal: (match: SearchMatch) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  return (
    <form
      className="json-toolbar"
      onSubmit={(event) => {
        event.preventDefault();
        setIndex(0);
        search(query);
      }}
    >
      <input
        aria-label="Search JSON keys and values"
        placeholder="Search all keys and values"
        maxLength={4096}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button>Search JSON</button>
      <output>{searching ? "Searching…" : `${matches.length} matches`}</output>
      <button type="button" disabled={!searching} onClick={cancel}>
        Cancel JSON search
      </button>
      <button
        type="button"
        disabled={!matches.length}
        onClick={() => {
          const match = matches[index % matches.length];
          if (match) reveal(match);
          setIndex(index + 1);
        }}
      >
        Next match
      </button>
    </form>
  );
}
