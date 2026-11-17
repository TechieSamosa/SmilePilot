import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { IconBack, IconChevron } from "./icons";
import { useBackHandler, useNav } from "./nav";

// ---------- toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------- layout ----------
export function TopBar({
  title,
  sub,
  back,
  actions,
  leading,
}: {
  title: ReactNode;
  sub?: ReactNode;
  back?: boolean;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  const nav = useNav();
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" onClick={nav.back} aria-label="Back">
          <IconBack />
        </button>
      )}
      {leading}
      <h1>
        {title}
        {sub && <span className="sub">{sub}</span>}
      </h1>
      {actions}
    </header>
  );
}

export function Screen({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  return <main className={`content${tabs ? "" : " no-tabs"}`}>{children}</main>;
}

// ---------- sheet ----------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useBackHandler(open, onClose);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

// ---------- confirm dialog (promise based) ----------
interface ConfirmOpts {
  title: string;
  message?: string;
  ok?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Sheet open={!!state} onClose={() => done(false)} title={state?.title}>
        {state?.message && (
          <p className="muted pre" style={{ marginTop: 0 }}>
            {state.message}
          </p>
        )}
        <div className="btn-grid">
          <button className="btn" onClick={() => done(false)}>
            Cancel
          </button>
          <button className={`btn ${state?.danger ? "danger" : "primary"}`} onClick={() => done(true)}>
            {state?.ok ?? "OK"}
          </button>
        </div>
      </Sheet>
    </ConfirmCtx.Provider>
  );
}

// ---------- form bits ----------
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Like Field, but for groups of buttons/chips (a <label> would forward taps to the first chip). */
export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 420)}px`;
  }, [props.value]);
  return <textarea ref={ref} className="input" rows={3} {...props} />;
}

export function ListItem({
  icon,
  title,
  sub,
  right,
  onClick,
  chevron = true,
}: {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  return (
    <button className="list-item" onClick={onClick} type="button">
      {icon}
      <div className="grow">
        <div className="bold ellipsis">{title}</div>
        {sub && <div className="small muted ellipsis">{sub}</div>}
      </div>
      {right}
      {chevron && onClick && <IconChevron className="chev" />}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`segmented${className ? ` ${className}` : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)} role="tab" aria-selected={o.value === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChipToggle({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" className={`chip${on ? " on" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text tag input + quick-pick chips (allergies, medical history). */
export function TagInput({ value, onChange, suggestions, placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder?: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
  };
  const extras = value.filter((v) => !suggestions.includes(v));
  return (
    <div className="stack">
      <ChipToggle options={[...suggestions, ...extras]} value={value} onChange={onChange} />
      <div className="row">
        <input
          className="input grow"
          value={text}
          placeholder={placeholder ?? "Add other…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="bold" style={{ marginTop: 8, color: "var(--text)" }}>
        {title}
      </div>
      {children && <div className="small" style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

/** Hidden file input triggered by a button. */
export function useFilePicker(accept: string, onFiles: (files: File[]) => void, opts: { multiple?: boolean; capture?: boolean } = {}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const cb = useRef(onFiles);
  cb.current = onFiles;
  useEffect(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = !!opts.multiple;
    if (opts.capture) input.setAttribute("capture", "environment");
    input.style.display = "none";
    input.onchange = () => {
      const files = [...(input.files ?? [])];
      input.value = "";
      if (files.length) cb.current(files);
    };
    document.body.appendChild(input);
    ref.current = input;
    return () => input.remove();
  }, [accept, opts.multiple, opts.capture]);
  return () => ref.current?.click();
}
