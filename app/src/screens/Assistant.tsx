import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { db, getSetting, setSetting, uid } from "../db";
import { distillPreference, isClaudeConfigured } from "../lib/ai/claude";
import { AGENT_STARTERS, runAgent } from "../lib/ai/agent";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getProfile } from "../db";
import { whatsappUrl } from "../lib/format";
import { openExternal } from "../lib/platform";
import type { Patient } from "../types";
import { IconWhatsApp } from "../ui/icons";
import { useConfirm } from "../ui/kit";
import { shareText } from "../lib/platform";
import type { ChatMessage } from "../types";
import { IconCopy, IconPlus, IconSend, IconShare, IconThumbDown, IconThumbUp } from "../ui/icons";
import { AutoTextarea, Screen, Sheet, Spinner, TopBar, useToast } from "../ui/kit";
import { useNav } from "../ui/nav";
import { OfflineReference } from "../components/OfflineReference";


export default function Assistant({ patientId }: { patientId?: string }) {
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const apiHistory = useRef<{ thread: string; msgs: BetaMessageParam[] } | null>(null);
  const [cards, setCards] = useState<{ id: string; patient: Patient; text: string }[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [why, setWhy] = useState<{ msg: ChatMessage; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const patient = useLiveQuery(async () => (patientId ? db.patients.get(patientId) : undefined), [patientId]);
  const pushed = nav.stack.length > 1;

  useEffect(() => {
    isClaudeConfigured().then(setConfigured);
    (async () => {
      if (patientId) setThreadId(`patient-${patientId}`);
      else setThreadId(await getSetting<string>("chatThread", uid()));
    })();
  }, [patientId]);

  const messages = useLiveQuery(async () => (threadId ? db.chat.where("threadId").equals(threadId).sortBy("createdAt") : []), [threadId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, streaming]);

  const send = async (q: string) => {
    if (!q.trim() || !threadId || streaming !== null) return;
    setText("");
    const um: ChatMessage = { id: uid(), threadId, role: "user", content: q.trim(), patientId, createdAt: Date.now() };
    await db.chat.add(um);
    if (!patientId) await setSetting("chatThread", threadId);
    // full tool-use history for this session; rebuilt from saved text when the thread changes
    if (!apiHistory.current || apiHistory.current.thread !== threadId)
      apiHistory.current = { thread: threadId, msgs: (messages ?? []).slice(-20).map((m) => ({ role: m.role, content: m.content })) };
    const userText =
      patient && apiHistory.current.msgs.length === 0 ? `(This conversation is about patient ${patient.name}, id ${patient.id}.) ${q.trim()}` : q.trim();
    setStreaming("");
    abort.current = new AbortController();
    try {
      const { text: answer, messages: next } = await runAgent([...apiHistory.current.msgs, { role: "user", content: userText }], {
        status: (s) => setStreaming(s),
        confirm: (title, detail) => confirm({ title, message: detail, ok: "Confirm" }),
        whatsapp: (p, t) => setCards((c) => [...c, { id: uid(), patient: p, text: t }]),
        signal: abort.current.signal,
      });
      apiHistory.current = { thread: threadId, msgs: next };
      await db.chat.add({ id: uid(), threadId, role: "assistant", content: answer || "Done.", patientId, createdAt: Date.now() });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast((e as Error).message);
    } finally {
      setStreaming(null);
    }
  };

  const rate = async (m: ChatMessage, r: 1 | -1) => {
    await db.chat.update(m.id, { rating: r });
    if (r === 1) {
      await db.feedback.add({ id: uid(), kind: "chat", rating: 1, aiText: m.content, createdAt: Date.now() });
      toast("Thanks for the feedback");
    } else setWhy({ msg: m, text: "" });
  };

  const submitWhy = async () => {
    if (!why) return;
    const { msg, text: comment } = why;
    setWhy(null);
    await db.feedback.add({ id: uid(), kind: "chat", rating: -1, aiText: msg.content, comment, createdAt: Date.now() });
    if (comment.trim()) {
      try {
        const pref = await distillPreference(msg.content, comment);
        if (pref) {
          await db.preferences.add({ id: uid(), text: pref, source: "learned", createdAt: Date.now() });
          toast(`Learned: “${pref}”`);
        }
      } catch {
        /* offline — feedback still stored */
      }
    }
  };

  const newChat = async () => {
    const t = uid();
    setThreadId(t);
    if (!patientId) await setSetting("chatThread", t);
  };

  return (
    <>
      <TopBar
        back={pushed}
        title={configured === false ? "Quick reference" : patient ? `AI · ${patient.name}` : "AI Agent"}
        sub={configured === false ? "Medicines, Rx sets and care sheets — works offline" : patient ? "Answers consider this patient's history" : "Asks you before changing anything"}
        actions={
          configured === false ? undefined : (
            <button className="icon-btn" onClick={newChat} aria-label="New chat">
              <IconPlus />
            </button>
          )
        }
      />
      <Screen tabs={!pushed}>
        {configured === false ? (
          <OfflineReference />
        ) : (
          <div className="chat" style={{ paddingBottom: 90 }}>
            {messages?.length === 0 && streaming === null && (
              <>
                <p className="small muted">
                  Ask clinical questions, or ask me to <b>do things</b>: find patients, check your schedule, book appointments, update aligners,
                  prepare WhatsApp reminders. I always ask before changing anything.
                </p>
                <div className="stack">
                  {AGENT_STARTERS.map((s) => (
                    <button key={s} className="btn block" style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left", minHeight: 48, height: "auto", padding: "10px 14px" }} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages?.map((m) => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                <div className={`bubble ${m.role}`}>{m.content}</div>
                {m.role === "assistant" && (
                  <div className="bubble-actions">
                    <button className={m.rating === 1 ? "on" : ""} onClick={() => rate(m, 1)} aria-label="Helpful">
                      <IconThumbUp />
                    </button>
                    <button className={m.rating === -1 ? "on" : ""} onClick={() => rate(m, -1)} aria-label="Not helpful">
                      <IconThumbDown />
                    </button>
                    <button onClick={() => navigator.clipboard?.writeText(m.content).then(() => toast("Copied"))} aria-label="Copy">
                      <IconCopy />
                    </button>
                    <button onClick={() => shareText(m.content)} aria-label="Share">
                      <IconShare />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {cards.map((c) => (
              <div key={c.id} className="card" style={{ alignSelf: "stretch", marginBottom: 0 }}>
                <div className="small bold" style={{ marginBottom: 6 }}>
                  WhatsApp to {c.patient.name}
                </div>
                <div className="small pre">{c.text}</div>
                <div className="btn-grid" style={{ marginTop: 8 }}>
                  <button
                    className="btn primary sm"
                    onClick={async () => {
                      const prof = await getProfile();
                      openExternal(whatsappUrl(c.patient.phone, prof.countryCode, c.text));
                      setCards((x) => x.filter((y) => y.id !== c.id));
                    }}
                  >
                    <IconWhatsApp /> Send
                  </button>
                  <button className="btn sm" onClick={() => setCards((x) => x.filter((y) => y.id !== c.id))}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
            {streaming !== null && (
              <div className="bubble assistant" onClick={() => abort.current?.abort()}>
                {streaming || (
                  <span className="row small muted">
                    <Spinner /> Thinking…
                  </span>
                )}
              </div>
            )}
            <div ref={end} />
          </div>
        )}
      </Screen>
      {configured !== false && (
        <div className="composer" style={pushed ? { bottom: 0, paddingBottom: "calc(var(--safe-bottom) + 8px)" } : undefined}>
          <div className="composer-inner">
            <AutoTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask the assistant…"
              rows={1}
              style={{ minHeight: 46 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            <button className="btn primary" style={{ width: 52, padding: 0 }} onClick={() => send(text)} disabled={!text.trim() || streaming !== null} aria-label="Send">
              {streaming !== null ? <Spinner /> : <IconSend />}
            </button>
          </div>
        </div>
      )}
      <Sheet open={!!why} onClose={() => setWhy(null)} title="What was wrong?">
        <p className="small muted" style={{ marginTop: 0 }}>
          Your correction is saved and turned into a standing instruction, so the assistant improves for you.
        </p>
        <AutoTextarea value={why?.text ?? ""} onChange={(e) => why && setWhy({ ...why, text: e.target.value })} placeholder="e.g. The dose is wrong — in India we use 625 mg BD" />
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={submitWhy}>
          Save feedback
        </button>
      </Sheet>
    </>
  );
}
