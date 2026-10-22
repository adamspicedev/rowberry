import * as monaco from "monaco-editor/editor/editor.api.js";

export function observeEditorTheme() {
  const theme = () =>
    monaco.editor.setTheme(
      document.documentElement.dataset.theme === "dark" ||
        (document.documentElement.dataset.theme === "system" &&
          matchMedia("(prefers-color-scheme: dark)").matches)
        ? "vs-dark"
        : "vs",
    );
  const observer = new MutationObserver(theme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", theme);
  theme();
  return () => {
    observer.disconnect();
    media.removeEventListener("change", theme);
  };
}
