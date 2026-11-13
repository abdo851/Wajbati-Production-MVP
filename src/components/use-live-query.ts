"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";

const REQUEST_TIMEOUT_MS = 12000;

export function useLiveQuery<T>(url: string | null, intervalMs = 4000) {
  const { t } = useI18n();
  const failedMessage = useRef(t("live.failed"));
  failedMessage.current = t("live.failed");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [reconnecting, setReconnecting] = useState(false);
  const attemptRef = useRef(0);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!url || runningRef.current) return;
    const attempt = ++attemptRef.current;
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const next = await readJson<T>(response);
      if (attempt !== attemptRef.current) return;
      setData(next);
      setError(null);
      setReconnecting(false);
    } catch (caught) {
      if (attempt !== attemptRef.current) return;
      const aborted = caught instanceof DOMException && caught.name === "AbortError";
      setError(aborted ? failedMessage.current : caught instanceof Error ? caught.message : failedMessage.current);
      setReconnecting(false);
    } finally {
      window.clearTimeout(timer);
      if (attempt === attemptRef.current) {
        runningRef.current = false;
        setLoading(false);
      }
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void reload();
    }, intervalMs);
    function onVisible() {
      if (!document.hidden) void reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      attemptRef.current += 1;
      runningRef.current = false;
      abortRef.current?.abort();
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, reload, url]);

  return { data, error, loading, reconnecting, reload };
}
