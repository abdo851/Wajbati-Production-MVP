"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { useSession } from "@/components/use-session";
import { formatWhen } from "@/lib/format";
import type {
  AppNotificationRecord,
  MarketplaceConversationRecord,
  MarketplaceMessageRecord,
} from "@/lib/marketplace/types";
import { unreadFor } from "@/lib/marketplace/conversations";
import { readJson } from "@/lib/read-json";

type ConversationRow = MarketplaceConversationRecord & { unread?: number };

export function MarketplaceInbox() {
  const { t, lang } = useI18n();
  const { session, error: sessionError } = useSession();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("c");

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [messages, setMessages] = useState<MarketplaceMessageRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotificationRecord[]>([]);
  const [active, setActive] = useState<MarketplaceConversationRecord | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const role = session?.user?.role;
  const allowed = role === "customer" || role === "chef";
  const userId = session?.user?.id;

  const loadList = useCallback(async () => {
    const response = await fetch("/api/marketplace/conversations", { cache: "no-store" });
    const payload = await readJson<{ conversations: ConversationRow[] }>(response);
    setConversations(payload.conversations);
  }, []);

  const loadNotifications = useCallback(async () => {
    const response = await fetch("/api/marketplace/notifications", { cache: "no-store" });
    const payload = await readJson<{ notifications: AppNotificationRecord[] }>(response);
    setNotifications(payload.notifications.filter((row) => row.kind === "marketplace.message"));
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const response = await fetch(`/api/marketplace/conversations/${id}/messages`, { cache: "no-store" });
    const payload = await readJson<{
      conversation: MarketplaceConversationRecord;
      messages: MarketplaceMessageRecord[];
    }>(response);
    setActive(payload.conversation);
    setMessages(payload.messages);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let stopped = false;
    async function boot() {
      try {
        await Promise.all([loadList(), loadNotifications()]);
        if (!stopped) {
          setError(null);
          setLoadingList(false);
        }
      } catch (caught) {
        if (!stopped) {
          setError(caught instanceof Error ? caught.message : t("live.failed"));
          setLoadingList(false);
        }
      }
    }
    const start = window.setTimeout(() => void boot(), 0);
    const timer = window.setInterval(() => {
      void loadList().catch(() => undefined);
      void loadNotifications().catch(() => undefined);
    }, 10_000);
    return () => {
      stopped = true;
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [allowed, loadList, loadNotifications, t]);

  useEffect(() => {
    if (!allowed || !selectedId) return;
    let stopped = false;
    async function openSelected() {
      try {
        await loadThread(selectedId!);
        await loadList();
        if (!stopped) setError(null);
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : t("live.failed"));
      }
    }
    const start = window.setTimeout(() => void openSelected(), 0);
    const timer = window.setInterval(() => {
      void loadThread(selectedId!).catch(() => undefined);
    }, 8_000);
    return () => {
      stopped = true;
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [allowed, selectedId, loadThread, loadList, t]);

  const peerLabel = useMemo(() => {
    if (!active || !userId) return t("market.inbox.title");
    return active.buyerUserId === userId ? t("market.inbox.withSeller") : t("market.inbox.withBuyer");
  }, [active, userId, t]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !body.trim()) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketplace/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      await readJson(response);
      setBody("");
      await loadThread(selectedId);
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("chat.failed"));
    } finally {
      setPending(false);
    }
  }

  if (sessionError && !session) {
    return <p className="px-4 py-16 text-sm text-terracotta-deep">{sessionError}</p>;
  }
  if (!session) {
    return <p className="px-4 py-16 text-sm text-muted">{t("gate.checking")}</p>;
  }
  if (!allowed) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-4xl">{t("market.inbox.protected")}</h1>
        <Link href="/" className={`${primaryButtonClass} mt-6`}>
          {t("gate.openDashboard")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{t("market.inbox.kicker")}</p>
          <h1 className="font-display text-4xl text-ink">{t("market.inbox.title")}</h1>
        </div>
        <Link href="/" className={quietButtonClass}>
          {t("market.inbox.browse")}
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-terracotta-deep">
          {error}
        </p>
      ) : null}

      {notifications.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">{t("market.inbox.notifications")}</h2>
          <ul className="mt-2 space-y-2">
            {notifications.slice(0, 8).map((note) => (
              <li key={note.id}>
                <Link
                  href={note.href || "/inbox"}
                  className="block rounded-2xl border border-line bg-card px-4 py-3 text-sm transition hover:border-brand/35"
                >
                  <p className="font-semibold">{note.title}</p>
                  <p className="mt-1 text-muted">{note.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selectedId ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl">{peerLabel}</h2>
            <Link href="/inbox" className={quietButtonClass}>
              {t("market.inbox.back")}
            </Link>
          </div>
          <ul className="mt-4 max-h-[min(52dvh,28rem)] space-y-3 overflow-y-auto rounded-3xl border border-line bg-card p-4">
            {!active || active.id !== selectedId ? (
              <li className="text-sm text-muted">{t("board.loading")}</li>
            ) : messages.length === 0 ? (
              <li className="text-sm text-muted">{t("chat.empty")}</li>
            ) : (
              messages.map((message) => {
                const mine = message.senderUserId === userId;
                return (
                  <li
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "ms-auto bg-brand/10 text-ink" : "me-auto bg-surface text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p className="mt-1 text-[11px] text-muted">{formatWhen(message.createdAt, lang)}</p>
                  </li>
                );
              })
            )}
          </ul>
          <form onSubmit={send} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className={inputClass}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("chat.placeholder")}
              maxLength={1000}
              required
            />
            <button type="submit" className={primaryButtonClass} disabled={pending || !active}>
              {pending ? t("market.contactSending") : t("chat.send")}
            </button>
          </form>
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted">{t("market.inbox.threads")}</h2>
          {loadingList ? <p className="mt-3 text-sm text-muted">{t("board.loading")}</p> : null}
          {!loadingList && conversations.length === 0 ? (
            <p className="lift-card mt-4 rounded-3xl px-5 py-10 text-center text-base text-muted">
              {t("market.inbox.empty")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {conversations.map((row) => {
                const unread = typeof row.unread === "number" ? row.unread : unreadFor(row, userId || "");
                return (
                  <li key={row.id}>
                    <Link
                      href={`/inbox?c=${row.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 transition hover:border-brand/35"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {row.buyerUserId === userId ? t("market.inbox.withSeller") : t("market.inbox.withBuyer")}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {row.lastMessageAt ? formatWhen(row.lastMessageAt, lang) : t("chat.empty")}
                        </p>
                      </div>
                      {unread > 0 ? (
                        <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white">{unread}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
