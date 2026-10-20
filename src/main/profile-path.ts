import path from "node:path";
export function profilePath(appData: string, override: string): string {
  return override ? path.resolve(override) : path.join(appData, "dbapp");
}
