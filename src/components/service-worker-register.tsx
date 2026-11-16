"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "imports" }).catch(() => undefined);
    void register();
    const interval = window.setInterval(() => {
      void navigator.serviceWorker.getRegistration().then((registration) => registration?.update());
    }, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
