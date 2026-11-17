import { useLiveQuery } from "dexie-react-hooks";
import { getProfile } from "../db";
import { IconBrain, IconCalendar, IconChart, IconDownload, IconFile, IconSettings, ToothLogo } from "../ui/icons";
import { ListItem, Screen, TopBar } from "../ui/kit";
import { useNav } from "../ui/nav";
import { PRESET } from "../preset";

export default function More() {
  const nav = useNav();
  const p = useLiveQuery(getProfile, []);
  const ic = (el: React.ReactNode) => <div className="avatar" style={{ width: 38, height: 38 }}>{el}</div>;
  const sz = { width: 20, height: 20 };
  return (
    <>
      <TopBar title="More" />
      <Screen>
        <div className="card row">
          <div className="brand-mark" style={{ width: 46, height: 46 }}>
            <ToothLogo />
          </div>
          <div className="grow">
            <div className="bold">{p?.doctorName || "Doctor"}</div>
            <div className="small muted">{p?.clinicName || "Set up your clinic in Settings"}</div>
          </div>
        </div>
        <div className="list">
          <ListItem icon={ic(<IconCalendar style={sz} />)} title="Appointments" sub="Upcoming and past bookings" onClick={() => nav.push({ name: "appointments" })} />
          <ListItem icon={ic(<IconChart style={sz} />)} title="AI accuracy & learning" sub="Your reviews, per-finding accuracy, training data" onClick={() => nav.push({ name: "insights" })} />
          <ListItem icon={ic(<IconBrain style={sz} />)} title="AI memory" sub="Preferences the assistant follows" onClick={() => nav.push({ name: "preferences" })} />
          <ListItem icon={ic(<IconDownload style={sz} />)} title="Backup & restore" sub="Keep your records safe" onClick={() => nav.push({ name: "backup" })} />
          <ListItem icon={ic(<span style={{ fontSize: 18 }}>✨</span>)} title="Pro AI agent" sub="Optional — your own Claude key unlocks an AI that works for you" onClick={() => nav.push({ name: "settings" })} />
          <ListItem icon={ic(<IconSettings style={sz} />)} title="Settings" sub="Clinic, AI key, PIN, models" onClick={() => nav.push({ name: "settings" })} />
          <ListItem icon={ic(<IconFile style={sz} />)} title="Help & safety" sub="How to use, privacy, limitations" onClick={() => nav.push({ name: "about" })} />
        </div>
        <p className="tiny muted center">{PRESET.appName} {__APP_VERSION__}</p>
      </Screen>
    </>
  );
}
