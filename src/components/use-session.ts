"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";
import type { SessionResponse } from "@/lib/types";

type Listener = () => void;

let snapshot: SessionResponse | null = null;
let errorSnapshot: string | null = null;
let settled = false;
let generation = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function loadSession(failedMessage: string) {
  const ticket = ++generation;
  const request = (async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (ticket !== generation) return;
      snapshot = await readJson<SessionResponse>(response);
      errorSnapshot = null;
      settled = true;
    } catch (caught) {
      if (ticket !== generation) return;
      errorSnapshot = caught instanceof Error ? caught.message : failedMessage;
      settled = true;
    } finally {
      if (ticket === generation) {
        inflight = null;
        emit();
      }
    }
  })();
  inflight = request;
  return request;
}

export function useSession() {
  const { t } = useI18n();
  const failedMessage = useRef(t("session.failed"));
  failedMessage.current = t("session.failed");
  const [session, setSession] = useState<SessionResponse | null>(snapshot);
  const [error, setError] = useState<string | null>(errorSnapshot);

  useEffect(() => {
    function sync() {
      setSession(snapshot);
      setError(errorSnapshot);
    }
    listeners.add(sync);
    sync();
    if (!settled && !inflight) void loadSession(failedMessage.current);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const reload = useCallback(async () => {
    await loadSession(failedMessage.current);
  }, []);

  return { session, error, reload };
}
