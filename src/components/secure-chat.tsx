"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { messageSharesContact } from "@/lib/contact-guard";
import { formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { DirectThread } from "@/lib/types";

type Target = { mealId?: string; orderId?: string; threadId?: string };

function queryOf(target: Target) {
  const params = new URLSearchParams();
  if (target.mealId) params.set("mealId", target.mealId);
  if (target.orderId) params.set("orderId", target.orderId);
  if (target.threadId) params.set("threadId", target.threadId);
  return params.toString();
}

export function SecureChat({ mealId, orderId, threadId }: Target) {
  const { t } = useI18n();
  const [thread, setThread] = useState<DirectThread | null>(null);
  const [body, setBody] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const target = { mealId, orderId, threadId };

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const response = await fetch(`/api/secure-chat?${queryOf(target)}`, { cache: "no-store" });
        const payload = await readJson<{ thread: DirectThread }>(response);
        if (!stopped) {
          setThread(payload.thread);
          setError(null);
        }
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : t("chat.signIn"));
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [mealId, orderId, threadId, t]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (messageSharesContact(body)) {
      setWarning(t("chat.blocked"));
      return;
    }
    setPending(true);
    setWarning(null);
    setError(null);
    try {
      const response = await fetch("/api/secure-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, mealId, orderId, threadId }),
      });
      const payload = await readJson<{ thread: DirectThread }>(response);
      setThread(payload.thread);
      setBody("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("chat.failed");
      if (message.includes("@") || message.includes("هاتف") || message.includes("phone") || message.includes("lien") || message.includes("رابط")) {
        setWarning(t("chat.blocked"));
      } else {
        setError(message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-[0_8px_30px_rgba(30,26,21,0.06)]">
      <h3 className="font-display text-2xl">{t("chat.secureTitle")}</h3>
      {thread?.peerName ? <p className="mt-1 text-sm text-muted">{thread.peerName}{thread.title ? ` · ${thread.title}` : ""}</p> : null}
      {warning ? <p role="alert" className="mt-3 rounded-2xl bg-terracotta/15 px-3 py-2 text-sm font-medium text-terracotta-deep">{warning}</p> : null}
      {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
      <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
        {(thread?.messages.length ?? 0) === 0 ? <li className="text-sm text-muted">{t("chat.empty")}</li> : null}
        {(thread?.messages ?? []).map((message) => (
          <li key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.mine ? "ms-auto bg-[#F3EBE1]" : "bg-background"}`}>
            <p className="text-xs text-muted">{message.senderName} · {formatWhen(message.createdAt)}</p>
            <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void send(event)} className="mt-4 flex gap-2">
        <input className={inputClass} value={body} onChange={(event) => { setBody(event.target.value); setWarning(null); }} placeholder={t("chat.placeholder")} maxLength={1000} required />
        <button className={primaryButtonClass} type="submit" disabled={pending}>{t("chat.send")}</button>
      </form>
    </section>
  );
}

export function SecureInbox() {
  const { t } = useI18n();
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch("/api/secure-chat", { cache: "no-store" })
        .then((response) => readJson<{ threads: DirectThread[] }>(response))
        .then((payload) => {
          setThreads(payload.threads);
          setActive((current) => current ?? payload.threads[0]?.threadId ?? null);
        })
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("chat.failed")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t]);

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">{t("chat.inbox")}</h2>
      {error ? <p className="mt-2 text-sm text-terracotta-deep">{error}</p> : null}
      {threads.length === 0 ? <p className="mt-3 text-sm text-muted">{t("chat.empty")}</p> : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-[16rem_1fr]">
        <ul className="space-y-2">
          {threads.map((thread) => (
            <li key={thread.threadId}>
              <button type="button" className={`${active === thread.threadId ? primaryButtonClass : quietButtonClass} w-full`} onClick={() => setActive(thread.threadId)}>
                <span className="block truncate">{thread.peerName || thread.title}</span>
              </button>
            </li>
          ))}
        </ul>
        {active ? <SecureChat threadId={active} /> : null}
      </div>
    </section>
  );
}
