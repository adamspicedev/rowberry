import { updateWorkspace, workspaceState } from "../../app/workspace";
let currentDrafts: string[] | null = null;
export function loadDrafts(): string[] {
  return [...(currentDrafts ?? workspaceState().sql)];
}
export function saveDrafts(sql: string[]) {
  currentDrafts = [...sql];
  updateWorkspace({ sql });
  return true;
}
