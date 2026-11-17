import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../db";
import { ageOf, initials } from "../lib/format";
import { IconPlus, IconSearch, IconUsers } from "../ui/icons";
import { Empty, ListItem, Screen, TopBar } from "../ui/kit";
import { useNav } from "../ui/nav";

export default function Patients() {
  const nav = useNav();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const list = useLiveQuery(async () => {
    let all = await db.patients.toArray();
    const s = q.trim().toLowerCase();
    if (s) all = all.filter((p) => p.name.toLowerCase().includes(s) || p.phone.replace(/\s/g, "").includes(s.replace(/\s/g, "")));
    return sort === "name" ? all.sort((a, b) => a.name.localeCompare(b.name)) : all.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [q, sort]);

  return (
    <>
      <TopBar
        title="Patients"
        sub={list ? `${list.length} ${q ? "found" : "total"}` : undefined}
        actions={
          <select className="input" style={{ width: "auto", minHeight: 38, padding: "4px 8px" }} value={sort} onChange={(e) => setSort(e.target.value as "recent" | "name")} aria-label="Sort">
            <option value="recent">Recent</option>
            <option value="name">A–Z</option>
          </select>
        }
      />
      <Screen>
        <div className="search" style={{ marginBottom: 12 }}>
          <IconSearch />
          <input className="input" type="search" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list && list.length === 0 ? (
          <Empty icon={<IconUsers />} title={q ? "No match" : "No patients yet"}>
            {q ? "Try another name or number." : "Tap “New patient” to add your first patient."}
          </Empty>
        ) : (
          <div className="list">
            {list?.map((p) => {
              const age = ageOf(p);
              return (
                <ListItem
                  key={p.id}
                  icon={<div className="avatar">{initials(p.name)}</div>}
                  title={p.name}
                  sub={[age !== undefined ? `${age} y` : "", p.gender, p.phone].filter(Boolean).join(" · ")}
                  right={p.allergies.length ? <span className="badge danger">Allergy</span> : undefined}
                  onClick={() => nav.push({ name: "patient", id: p.id })}
                />
              );
            })}
          </div>
        )}
      </Screen>
      <button className="fab" onClick={() => nav.push({ name: "patientForm" })}>
        <IconPlus /> New patient
      </button>
    </>
  );
}
