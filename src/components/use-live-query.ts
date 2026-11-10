"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";

export function useLiveQuery<T>(url: string | null, intervalMs = 4000) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const response = await fetch(url, { cache: "no-store" });
      setData(await readJson<T>(response));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("live.failed"));
    } finally {
      setLoading(false);
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
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [intervalMs, reload, url]);

  return { data, error, loading, reload };
}
