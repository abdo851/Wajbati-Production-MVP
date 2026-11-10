"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";
import type { SessionResponse } from "@/lib/types";

export function useSession() {
  const { t } = useI18n();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      setSession(await readJson<SessionResponse>(response));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("session.failed"));
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  return { session, error, reload };
}
