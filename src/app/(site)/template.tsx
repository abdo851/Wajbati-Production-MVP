"use client";

import type { ReactNode } from "react";

/**
 * Keep this free of module-level mutable state and enter animations.
 * Module state / remount animations were amplifying Fast Refresh into a
 * visible full-page reload loop during local development.
 */
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
