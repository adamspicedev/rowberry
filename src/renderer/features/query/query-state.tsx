import { z } from "zod";
import { SqlSchema } from "../../../shared/protocol";
const Drafts = z.array(z.object({ sql: SqlSchema.or(z.literal("")) }).strict()).max(16);
const key = "rowberry.sql.drafts";
let currentDrafts: string[] | null = null;
export function loadDrafts(): string[] {
  if (currentDrafts) return [...currentDrafts];
  try {
    const data = Drafts.safeParse(JSON.parse(localStorage.getItem(key) ?? "[]"));
    return data.success ? data.data.map((item) => item.sql) : [];
  } catch {
    return [];
  }
}
export function saveDrafts(sql: string[]) {
  currentDrafts = [...sql];
  try {
    localStorage.setItem(key, JSON.stringify(sql.map((sql) => ({ sql }))));
    return true;
  } catch {
    return false;
  }
}
