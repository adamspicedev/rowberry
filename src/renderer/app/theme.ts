import type { Workspace } from "../../shared/workspace";
export function applyTheme(theme: Workspace["theme"]) {
  document.documentElement.dataset.theme = theme;
}
