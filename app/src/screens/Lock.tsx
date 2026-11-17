import { useEffect, useState } from "react";
import { getSetting } from "../db";
import { ToothLogo } from "../ui/icons";

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`dentalos:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Lock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length !== 4) return;
    (async () => {
      const want = await getSetting<string>("pinHash", "");
      if ((await hashPin(pin)) === want) onUnlock();
      else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 600);
      }
    })();
  }, [pin, onUnlock]);

  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));
  return (
    <div className="lock">
      <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 16 }}>
        <ToothLogo style={{ width: 36, height: 36 }} />
      </div>
      <div className="bold">{error ? "Wrong PIN" : "Enter PIN"}</div>
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < pin.length ? "on" : ""} style={error ? { borderColor: "var(--danger)" } : undefined} />
        ))}
      </div>
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button key={i} onClick={() => (k === "⌫" ? setPin((p) => p.slice(0, -1)) : press(k))} aria-label={k === "⌫" ? "Delete" : k}>
              {k}
            </button>
          ),
        )}
      </div>
      <p className="tiny muted center" style={{ maxWidth: 280 }}>
        Forgot the PIN? Reinstalling the app removes the PIN and all data — restore from your latest backup.
      </p>
    </div>
  );
}
