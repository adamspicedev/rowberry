import { useEffect, useRef, useState } from "react";
import type { SearchMatch } from "../../../json/search";
export function JsonSearch({
  search,
  onQueryChange,
  revision,
  matches,
  searching,
  reveal,
  cancel,
}: {
  revision: number;
  onQueryChange: (query: string) => void;
  search: (query: string) => void;
  matches: SearchMatch[];
  searching: boolean;
  cancel: () => void;
  reveal: (match: SearchMatch) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  useEffect(() => {
    const timeout = setTimeout(() => searchRef.current(query), 180);
    return () => clearTimeout(timeout);
  }, [query, revision]);
  return (
    <form
      className="json-toolbar json-search"
      onSubmit={(event) => {
        event.preventDefault();
        setIndex(0);
        search(query);
      }}
    >
      <input
        aria-label="Search JSON keys and values"
        placeholder="Filter keys and values…"
        maxLength={4096}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onQueryChange(event.target.value);
          setIndex(0);
        }}
      />
      {query && (
        <output aria-live="polite">{searching ? "Searching…" : `${matches.length} matches`}</output>
      )}
      <button type="button" hidden={!searching} onClick={cancel}>
        Cancel JSON search
      </button>
      <button
        type="button"
        hidden={!query}
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
