import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, getSetting, requestPersistentStorage } from "./db";
import Appointments from "./screens/Appointments";
import Assistant from "./screens/Assistant";
import Backup from "./screens/Backup";
import Help from "./screens/Help";
import Home from "./screens/Home";
import Insights from "./screens/Insights";
import Lock from "./screens/Lock";
import More from "./screens/More";
import Onboarding from "./screens/Onboarding";
import PatientDetail from "./screens/PatientDetail";
import PatientForm from "./screens/PatientForm";
import Patients from "./screens/Patients";
import Preferences from "./screens/Preferences";
import Settings from "./screens/Settings";
import VisitScreen from "./screens/VisitScreen";
import XrayReview from "./screens/XrayReview";
import { IconChat, IconHome, IconMenu, IconUsers } from "./ui/icons";
import { ConfirmProvider, ToastProvider } from "./ui/kit";
import { NavProvider, TAB_ROOTS, useNav, type Route } from "./ui/nav";

function Router() {
  const { route } = useNav();
  switch (route.name) {
    case "home":
      return <Home />;
    case "patients":
      return <Patients />;
    case "assistant":
      return <Assistant patientId={route.patientId} />;
    case "more":
      return <More />;
    case "appointments":
      return <Appointments />;
    case "patient":
      return <PatientDetail key={route.id} id={route.id} />;
    case "patientForm":
      return <PatientForm key={route.id ?? "new"} id={route.id} />;
    case "visit":
      return <VisitScreen key={route.id} id={route.id} initialTab={route.tab} />;
    case "xray":
      return <XrayReview key={route.id} id={route.id} />;
    case "settings":
      return <Settings />;
    case "insights":
      return <Insights />;
    case "backup":
      return <Backup />;
    case "preferences":
      return <Preferences />;
    case "about":
      return <Help />;
  }
}

const TABS: { route: Route; label: string; Icon: typeof IconHome }[] = [
  { route: { name: "home" }, label: "Today", Icon: IconHome },
  { route: { name: "patients" }, label: "Patients", Icon: IconUsers },
  { route: { name: "assistant" }, label: "Reference", Icon: IconChat },
  { route: { name: "more" }, label: "More", Icon: IconMenu },
];

function TabBar() {
  const nav = useNav();
  const online = useLiveQuery(async () => !!((await db.settings.get("anthropicKey"))?.value as string | undefined)?.trim(), []);
  const root = nav.stack[0]!.name;
  const isRoot = (TAB_ROOTS as readonly string[]).includes(nav.route.name) && nav.stack.length === 1;
  if (!isRoot) return null;
  return (
    <nav className="tabbar">
      <div className="tabbar-inner">
        {TABS.map(({ route, label, Icon }) => (
          <button key={route.name} className={`tab${root === route.name ? " active" : ""}`} onClick={() => nav.tab(route)}>
            <Icon />
            {route.name === "assistant" && online ? "AI Agent" : label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function useTheme() {
  const theme = useLiveQuery(() => db.settings.get("theme"), []);
  useEffect(() => {
    const v = (theme?.value as string) || "system";
    if (v === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
  }, [theme]);
}

export default function App() {
  const [ready, setReady] = useState<"loading" | "onboard" | "ok">("loading");
  const [locked, setLocked] = useState(false);
  useTheme();

  useEffect(() => {
    (async () => {
      const done = await getSetting<boolean>("onboarded", false);
      const pin = await getSetting<string>("pinHash", "");
      setLocked(!!pin);
      setReady(done ? "ok" : "onboard");
      requestPersistentStorage();
    })();
  }, []);

  // Re-lock after 3 minutes in the background.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = async () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 3 * 60 * 1000 && (await getSetting<string>("pinHash", ""))) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (ready === "loading") return null;
  return (
    <ToastProvider>
      <ConfirmProvider>
        {ready === "onboard" ? (
          <Onboarding onDone={() => setReady("ok")} />
        ) : (
          <NavProvider>
            <div className="app">
              <Router />
              <TabBar />
            </div>
          </NavProvider>
        )}
        {locked && ready === "ok" && <Lock onUnlock={() => setLocked(false)} />}
      </ConfirmProvider>
    </ToastProvider>
  );
}
