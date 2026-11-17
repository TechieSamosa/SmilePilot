/**
 * Tiny stack navigator with hardware-back support.
 *
 * Design: we keep exactly one extra "trap" entry in browser history. Every back press
 * (Android back button / gesture, browser back) pops that entry; we immediately re-arm it
 * and perform a *logical* back: close the top sheet, else pop the screen stack. At the
 * root screen with nothing open we do not re-arm, so the next back press exits the app.
 * No asynchronous history.back() calls are needed, so chained sheets can't desync.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Route =
  | { name: "home" }
  | { name: "patients" }
  | { name: "assistant"; patientId?: string }
  | { name: "more" }
  | { name: "appointments" }
  | { name: "patient"; id: string }
  | { name: "patientForm"; id?: string }
  | { name: "visit"; id: string; tab?: string }
  | { name: "xray"; id: string }
  | { name: "settings" }
  | { name: "insights" }
  | { name: "backup" }
  | { name: "preferences" }
  | { name: "about" };

export const TAB_ROOTS = ["home", "patients", "assistant", "more"] as const;

interface Nav {
  route: Route;
  stack: Route[];
  push: (r: Route) => void;
  replace: (r: Route) => void;
  back: () => void;
  tab: (r: Route) => void;
}

const Ctx = createContext<Nav | null>(null);

// Overlays (sheets, dialogs) register here so the back button closes them first.
const overlayHandlers: { id: number; close: () => void }[] = [];
let overlaySeq = 0;
let trapArmed = false;

function armTrap() {
  if (!trapArmed) {
    history.pushState({ dentalosTrap: true }, "");
    trapArmed = true;
  }
}

export function useBackHandler(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = ++overlaySeq;
    overlayHandlers.push({ id, close: () => closeRef.current() });
    armTrap();
    return () => {
      const i = overlayHandlers.findIndex((h) => h.id === id);
      if (i >= 0) overlayHandlers.splice(i, 1);
    };
  }, [open]);
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>(() => [{ name: "home" }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    const onPop = () => {
      trapArmed = false;
      const top = overlayHandlers[overlayHandlers.length - 1];
      if (top) {
        top.close();
        armTrap();
        return;
      }
      if (stackRef.current.length > 1) {
        setStack((s) => s.slice(0, -1));
        armTrap();
        return;
      }
      // root screen, nothing open: leave the trap disarmed so the next back exits.
      if (stackRef.current[0]?.name !== "home") {
        setStack([{ name: "home" }]);
        armTrap();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (stack.length > 1 || stack[0]?.name !== "home") armTrap();
  }, [stack]);

  const push = useCallback((r: Route) => {
    setStack((s) => [...s, r]);
    armTrap();
    requestAnimationFrame(() => document.querySelector(".content")?.scrollTo(0, 0));
  }, []);

  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);

  const back = useCallback(() => {
    const top = overlayHandlers[overlayHandlers.length - 1];
    if (top) return top.close();
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const tab = useCallback((r: Route) => setStack([r]), []);

  const value = useMemo(() => ({ route: stack[stack.length - 1]!, stack, push, replace, back, tab }), [stack, push, replace, back, tab]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): Nav {
  const v = useContext(Ctx);
  if (!v) throw new Error("NavProvider missing");
  return v;
}
