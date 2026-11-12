"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";

const RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));
}

export function useLiveQuery<T>(url: string | null, intervalMs = 4000) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [reconnecting, setReconnecting] = useState(false);
  const attemptRef = useRef(0);
  const runningRef = useRef(false);

  const reload = useCallback(async () => {
    if (!url || runningRef.current) return;
    const attempt = ++attemptRef.current;
    runningRef.current = true;
    const stale = () => attempt !== attemptRef.current;
    try {
      for (let tryIndex = 0; tryIndex <= RETRIES; tryIndex += 1) {
        if (stale()) return;
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (response.status >= 500) {
            throw new TypeError("Failed to fetch");
          }
          const next = await readJson<T>(response);
          if (stale()) return;
          setData(next);
          setError(null);
          setReconnecting(false);
          setLoading(false);
          return;
        } catch (caught) {
          if (!isNetworkError(caught) || tryIndex === RETRIES) {
            if (stale()) return;
            if (isNetworkError(caught)) {
              setError(null);
              setReconnecting(true);
              setLoading(false);
              return;
            }
            setReconnecting(false);
            setLoading(false);
            setError(caught instanceof Error ? caught.message : t("live.failed"));
            return;
          }
          if (!stale()) {
            setReconnecting(true);
            setError(null);
          }
          await wait(RETRY_DELAY_MS);
        }
      }
    } finally {
      if (attempt === attemptRef.current) runningRef.current = false;
    }
  }, [t, url]);

  useEffect(() => {
    if (!url) return;
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);
    const interval = window.setInterval(() => {
      void reload();
    }, intervalMs);
    return () => {
      attemptRef.current += 1;
      runningRef.current = false;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [intervalMs, reload, url]);

  return { data, error, loading, reconnecting, reload };
}
