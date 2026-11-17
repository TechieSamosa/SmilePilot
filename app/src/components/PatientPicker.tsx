import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, uid } from "../db";
import { initials } from "../lib/format";
import type { Patient } from "../types";
import { IconPlus, IconSearch } from "../ui/icons";
import { ListItem, Sheet } from "../ui/kit";

export function PatientPicker({ open, onClose, onPick, title }: { open: boolean; onClose: () => void; onPick: (p: Patient) => void; title: string }) {
  const [q, setQ] = useState("");
  const [phone, setPhone] = useState("");
  const results = useLiveQuery(async () => {
    const all = await db.patients.orderBy("updatedAt").reverse().toArray();
    const s = q.trim().toLowerCase();
    return (s ? all.filter((p) => p.name.toLowerCase().includes(s) || p.phone.includes(s)) : all).slice(0, 30);
  }, [q]);

  const quickAdd = async () => {
    const now = Date.now();
    const p: Patient = {
      id: uid(),
      name: q.trim(),
      phone: phone.trim(),
      gender: "",
      allergies: [],
      conditions: [],
      medications: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    await db.patients.add(p);
    setQ("");
    setPhone("");
    onPick(p);
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="search" style={{ marginBottom: 10 }}>
        <IconSearch />
        <input className="input" placeholder="Search name or phone, or type a new name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length > 1 && !results?.some((p) => p.name.toLowerCase() === q.trim().toLowerCase()) && (
        <div className="card" style={{ background: "var(--surface-2)" }}>
          <div className="small bold" style={{ marginBottom: 8 }}>
            Add new patient “{q.trim()}”
          </div>
          <div className="row">
            <input className="input grow" placeholder="Phone (optional)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="btn primary" onClick={quickAdd}>
              <IconPlus /> Add
            </button>
          </div>
        </div>
      )}
      <div className="list">
        {results?.map((p) => (
          <ListItem key={p.id} icon={<div className="avatar">{initials(p.name)}</div>} title={p.name} sub={p.phone} onClick={() => onPick(p)} />
        ))}
        {results?.length === 0 && !q && <div className="empty small">No patients yet — type a name above to add one.</div>}
      </div>
    </Sheet>
  );
}
