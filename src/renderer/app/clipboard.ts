// Copy within the focused renderer without granting persistent clipboard permissions.
export function copyText(text: string): boolean {
  const previous = document.activeElement;
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  }
}
