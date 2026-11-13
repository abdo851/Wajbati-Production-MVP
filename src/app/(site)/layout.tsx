import { Suspense, type ReactNode } from "react";
import { CustomerWelcome } from "@/components/customer-welcome";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { TermsGate } from "@/components/terms-gate";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-16 border-b border-line/80 bg-background/80" />}>
        <SiteHeader />
      </Suspense>
      {children}
      <SiteFooter />
      <TermsGate />
      <CustomerWelcome />
    </>
  );
}
