export function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
export function pointerParts(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new Error("Expected JSON Pointer");
  return path
    .slice(1)
    .split("/")
    .map((p) => {
      if (/~(?:[^01]|$)/u.test(p)) throw new Error("Invalid pointer escape");
      return p.replaceAll("~1", "/").replaceAll("~0", "~");
    });
}
