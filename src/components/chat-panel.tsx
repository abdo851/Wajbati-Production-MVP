"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { ChatThread } from "@/lib/types";

export function OwnChat() {
  const { t } = useI18n();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch("/api/messages", { cache: "no-store" })
        .then((response) => readJson<{ thread: ChatThread | null }>(response))
        .then((payload) => setThread(payload.thread))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("chat.failed")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await readJson<{ thread: ChatThread }>(response);
      setThread(payload.thread);
      setBody("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("chat.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">{t("chat.title")}</h2>
      {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
      <ul className="mt-4 max-h-96 space-y-3 overflow-y-auto">
        {(thread?.messages ?? []).length === 0 ? <li className="text-sm text-muted">{t("chat.empty")}</li> : null}
        {(thread?.messages ?? []).map((message) => (
          <li key={message.id} className={`rounded-2xl px-3 py-2 text-sm ${message.sender === "user" ? "bg-[#F3EBE1]" : "bg-background"}`}>
            <p className="text-xs text-muted">{message.sender === "user" ? t("chat.you") : t("chat.desk")} · {formatWhen(message.createdAt)}</p>
            <p className="mt-1">{message.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void send(event)} className="mt-4 flex gap-2">
        <input className={inputClass} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("chat.placeholder")} required />
        <button className={primaryButtonClass} type="submit" disabled={pending}>{t("chat.send")}</button>
      </form>
    </section>
  );
}

export function AdminChat() {
  const { t } = useI18n();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const selected = threads.find((thread) => thread.threadId === active) ?? null;

  function load() {
    return fetch("/api/admin/messages", { cache: "no-store" })
      .then((response) => readJson<{ threads: ChatThread[] }>(response))
      .then((payload) => {
        setThreads(payload.threads);
        setActive((current) => current ?? payload.threads[0]?.threadId ?? null);
      });
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("chat.failed")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    setError(null);
    try {
      await readJson(await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selected.threadId, body }),
      }));
      setBody("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("chat.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="rounded-3xl border border-line bg-card p-4">
        <h2 className="font-display text-2xl">{t("admin.tabMessages")}</h2>
        {threads.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.noMessages")}</p> : null}
        <ul className="mt-3 space-y-2">
          {threads.map((thread) => (
            <li key={thread.threadId}>
              <button type="button" className={`w-full rounded-2xl px-3 py-2 text-start text-sm ${active === thread.threadId ? "bg-[#F3EBE1]" : "bg-background"}`} onClick={() => setActive(thread.threadId)}>
                <span className="block font-medium">{thread.participantName}</span>
                <span className="mt-1 block truncate text-muted">{thread.lastBody}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-3xl border border-line bg-card p-5">
        {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
        {selected ? (
          <>
            <h3 className="font-display text-2xl">{selected.participantName}</h3>
            <ul className="mt-4 max-h-96 space-y-3 overflow-y-auto">
              {selected.messages.map((message) => (
                <li key={message.id} className={`rounded-2xl px-3 py-2 text-sm ${message.sender === "admin" ? "bg-background" : "bg-[#F3EBE1]"}`}>
                  <p className="text-xs text-muted">{message.sender === "admin" ? t("chat.desk") : selected.participantName} · {formatWhen(message.createdAt)}</p>
                  <p className="mt-1">{message.body}</p>
                </li>
              ))}
            </ul>
            <form onSubmit={(event) => void send(event)} className="mt-4 flex gap-2">
              <input className={inputClass} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("chat.placeholder")} required />
              <button className={primaryButtonClass} type="submit" disabled={pending}>{t("admin.reply")}</button>
            </form>
          </>
        ) : (
          <p className="text-sm text-muted">{t("chat.empty")}</p>
        )}
      </div>
    </section>
  );
}
