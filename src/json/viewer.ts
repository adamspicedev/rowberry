/** Keep database JSON source intact: parsing through JS would round large numbers. */
export function rowJson(
  cells: readonly { name: string; text: string | null; typeOid: number }[],
): string {
  const used = new Set<string>();
  const reserved = new Set(cells.map((cell) => cell.name));
  return (
    "{\n" +
    cells
      .map((cell) => {
        let name = cell.name;
        let suffix = 2;
        while (used.has(name) || (name !== cell.name && reserved.has(name))) {
          name = `${cell.name} (${suffix++})`;
        }
        used.add(name);
        const value =
          cell.text === null
            ? "null"
            : [114, 3802].includes(cell.typeOid)
              ? cell.text
              : JSON.stringify(cell.text);
        return `  ${JSON.stringify(name)}: ${value}`;
      })
      .join(",\n") +
    "\n}"
  );
}
export function filterPaths(paths: readonly string[]): Set<string> {
  const visible = new Set<string>([""]);
  for (const path of paths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) visible.add(parts.slice(0, i + 1).join("/"));
  }
  return visible;
}
