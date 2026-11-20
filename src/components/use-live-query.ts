"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";

const REQUEST_TIMEOUT_MS = 12_000;
const MIN_START_GAP_MS = 5_000;

type SharedResult = { data?: unknown; error?: string };
type SharedListener = (result: SharedResult) => void;

type SharedPoll = {
  subscribers: number;
  timer: number | null;
  intervalMs: number;
  lastStarted: number;
  running: boolean;
  listeners: Set<SharedListener>;
};

const polls = new Map<string, SharedPoll>();

function sharedFor(url: string, intervalMs: number): SharedPoll {
  const existing = polls.get(url);
  if (existing) {
    existing.intervalMs = Math.max(existing.intervalMs, intervalMs, MIN_START_GAP_MS);
    return existing;
  }
  const created: SharedPoll = {
    subscribers: 0,
    timer: null,
    intervalMs: Math.max(intervalMs, MIN_START_GAP_MS),
    lastStarted: 0,
    running: false,
    listeners: new Set(),
  };
  polls.set(url, created);
  return created;
}

async function fetchShared(url: string, failedMessage: string, force = false) {
  const shared = polls.get(url);
  if (!shared) return;
  if (shared.running) return;
  const now = Date.now();
  if (!force && now - shared.lastStarted < MIN_START_GAP_MS) return;

  shared.running = true;
  shared.lastStarted = now;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const data = await readJson(response);
    const result: SharedResult = { data };
    shared.listeners.forEach((listener) => listener(result));
  } catch (caught) {
    const aborted = caught instanceof DOMException && caught.name === "AbortError";
    if (!aborted) {
      const result: SharedResult = {
        error: caught instanceof Error ? caught.message : failedMessage,
      };
      shared.listeners.forEach((listener) => listener(result));
    }
  } finally {
    window.clearTimeout(timer);
    shared.running = false;
  }
}

export function useLiveQuery<T>(url: string | null, intervalMs = 15_000) {
  const { t } = useI18n();
  const failedMessage = useRef(t("live.failed"));
  useEffect(() => {
    failedMessage.current = t("live.failed");
  }, [t]);

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [reconnecting, setReconnecting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!url) {
      setLoading(false);
      return;
    }

    const endpoint = url;
    const shared = sharedFor(endpoint, intervalMs);
    shared.subscribers += 1;

    const onResult: SharedListener = (result) => {
      if (!mountedRef.current) return;
      if (result.data !== undefined) {
        const next = result.data as T;
        setData((previous) =>
          previous !== null && JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
        setError(null);
        setReconnecting(false);
      } else if (result.error) {
        setError(result.error);
        setReconnecting(false);
      }
      setLoading(false);
    };
    shared.listeners.add(onResult);

    void fetchShared(endpoint, failedMessage.current, false);

    if (shared.timer == null) {
      shared.timer = window.setInterval(() => {
        if (document.hidden) return;
        void fetchShared(endpoint, failedMessage.current, false);
      }, shared.intervalMs);
    }

    function onVisible() {
      if (!document.hidden) void fetchShared(endpoint, failedMessage.current, false);
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      shared.listeners.delete(onResult);
      shared.subscribers = Math.max(0, shared.subscribers - 1);
      if (shared.subscribers === 0 && shared.timer != null) {
        window.clearInterval(shared.timer);
        shared.timer = null;
        polls.delete(endpoint);
      }
    };
  }, [intervalMs, url]);

  const reload = useCallback(async () => {
    if (!url) return;
    await fetchShared(url, failedMessage.current, true);
  }, [url]);

  return { data, error, loading, reconnecting, reload };
}
