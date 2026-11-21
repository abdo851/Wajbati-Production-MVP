import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-control-center min-h-dvh bg-[#f3f4f6] text-slate-900">{children}</div>;
}
