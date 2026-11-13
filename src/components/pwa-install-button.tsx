"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/language";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function runningStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function iosSafari() {
  const agent = window.navigator.userAgent;
  const iPhone = /iPhone|iPad|iPod/i.test(agent);
  const iPadDesktop = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return iPhone || iPadDesktop;
}

export function PwaInstallButton() {
  const { t } = useI18n();
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const [noteBox, setNoteBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    function syncInstalled() {
      setInstalled(runningStandalone());
    }
    function onPrompt(event: Event) {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
    }
    function onInstalled() {
      promptRef.current = null;
      setInstalled(true);
      setIosHelp(false);
    }
    syncInstalled();
    setReady(true);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", syncInstalled);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      media.removeEventListener("change", syncInstalled);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!iosHelp) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-pwa-note]")) return;
      setIosHelp(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setIosHelp(false);
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [iosHelp]);

  function placeNote() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(280, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setNoteBox({ top: rect.bottom + 8, left, width });
  }

  useEffect(() => {
    if (!iosHelp) return;
    placeNote();
    window.addEventListener("resize", placeNote);
    window.addEventListener("scroll", placeNote, true);
    return () => {
      window.removeEventListener("resize", placeNote);
      window.removeEventListener("scroll", placeNote, true);
    };
  }, [iosHelp]);

  if (!ready || installed) return null;

  async function install() {
    const deferred = promptRef.current;
    if (deferred) {
      setIosHelp(false);
      await deferred.prompt();
      const choice = await deferred.userChoice;
      promptRef.current = null;
      if (choice.outcome === "accepted" || runningStandalone()) setInstalled(true);
      return;
    }
    if (iosSafari()) {
      placeNote();
      setIosHelp(true);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-terracotta bg-terracotta px-2.5 text-sm font-medium text-white shadow-[0_8px_16px_-12px_rgba(184,92,62,0.9)] sm:px-3"
        aria-label={t("pwa.install")}
        aria-expanded={iosHelp}
        onClick={() => void install()}
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 4v10" strokeLinecap="round" />
          <path d="M8 10.5 12 14.5 16 10.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 18.5h14" strokeLinecap="round" />
        </svg>
        <span className="whitespace-nowrap">{t("pwa.install")}</span>
      </button>
      {iosHelp && noteBox
        ? createPortal(
            <div
              role="note"
              style={{ top: noteBox.top, left: noteBox.left, width: noteBox.width }}
              className="fixed z-[80] rounded-2xl border border-line bg-card p-3 text-start text-sm leading-6 text-foreground shadow-[0_12px_40px_rgba(30,26,21,0.16)]"
              data-pwa-note=""
            >
              <div className="flex items-start justify-between gap-2">
                <p>{t("pwa.ios")}</p>
                <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-base" aria-label={t("order.close")} onClick={() => setIosHelp(false)}>
                  ×
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
