import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
export type MenuItem = {
  label: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
  separator?: boolean;
};
type Toast = {
  id: number;
  message: string;
  error?: boolean;
  action?: { label: string; run: () => void };
};
type Menu = { x: number; y: number; label: string; items: MenuItem[]; trigger: HTMLElement };
const Context = createContext<{
  menu: (menu: Menu) => void;
  closeMenu: () => void;
  toast: (message: string, options?: Omit<Toast, "id" | "message">) => void;
} | null>(null);
export function useFeedback() {
  const value = useContext(Context);
  if (!value) throw new Error("FeedbackProvider is required");
  return value;
}
function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  useEffect(() => {
    if (paused || toast.error) return;
    const timer = setTimeout(() => dismiss(toast.id), 7000);
    return () => clearTimeout(timer);
  }, [paused, toast, dismiss]);
  return (
    <div
      className="toast"
      data-error={toast.error}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <span role={toast.error ? "alert" : "status"}>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button aria-label={`Dismiss ${toast.message}`} onClick={() => dismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useCallback((message: string, options?: Omit<Toast, "id" | "message">) => {
    const item = { id: ++nextId.current, message, ...options };
    setToasts((items) => [...items.slice(-3), item]);
  }, []);
  const dismiss = useCallback(
    (id: number) => setToasts((items) => items.filter((item) => item.id !== id)),
    [],
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const element = ref.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) setMenu(null);
    };
    const dismissOnLayout = () => setMenu(null);
    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("resize", dismissOnLayout);
    window.addEventListener("blur", dismissOnLayout);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("resize", dismissOnLayout);
      window.removeEventListener("blur", dismissOnLayout);
    };
  }, [menu]);
  return (
    <Context.Provider value={{ menu: setMenu, closeMenu, toast }}>
      {children}
      {createPortal(
        <>
          {menu && (
            <div
              ref={ref}
              className="context-menu"
              role="menu"
              tabIndex={-1}
              aria-label={menu.label}
              style={{ left: menu.x, top: menu.y }}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                const buttons = Array.from(
                  ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
                );
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                if (event.key === "Escape" || event.key === "Tab") {
                  event.preventDefault();
                  setMenu(null);
                  menu.trigger.focus();
                  return;
                }
                const target =
                  event.key === "ArrowDown"
                    ? (index + 1) % buttons.length
                    : event.key === "ArrowUp"
                      ? (index + buttons.length - 1) % buttons.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? buttons.length - 1
                          : -1;
                if (target >= 0) {
                  event.preventDefault();
                  buttons[target]?.focus();
                }
              }}
            >
              {menu.items.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  className={item.separator ? "menu-separator" : undefined}
                  disabled={item.disabled}
                  onClick={() => {
                    setMenu(null);
                    menu.trigger.focus();
                    void Promise.resolve()
                      .then(item.action)
                      .catch(() =>
                        toast("That action could not be completed. Try again.", { error: true }),
                      );
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <section className="toast-stack" aria-label="Notifications">
            {toasts.map((item) => (
              <ToastItem key={item.id} toast={item} dismiss={dismiss} />
            ))}
          </section>
        </>,
        document.body,
      )}
    </Context.Provider>
  );
}
