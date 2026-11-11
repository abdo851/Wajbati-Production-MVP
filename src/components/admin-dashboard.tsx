"use client";

import { useEffect, useState } from "react";
import { AdminChat } from "@/components/chat-panel";
import { LoginCard } from "@/components/login-card";
import { ReviewModal, type ReviewView } from "@/components/review-modal";
import { useI18n } from "@/components/language";
import { LiveDot, primaryButtonClass, quietButtonClass, StatusPill } from "@/components/ui";
import { useLiveQuery } from "@/components/use-live-query";
import { useSession } from "@/components/use-session";
import { formatMad, formatServiceDate, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import { isSuperAdmin } from "@/lib/super-admin";
import type { ActiveDelivery, AdminOverview, Chef, DriverRecord, FinanceSummary, StaffAccount } from "@/lib/types";

export function AdminDashboard() {
  const { t } = useI18n();
  const { session, reload } = useSession();

  if (!session) return <p className="px-4 py-16 text-sm text-muted">{t("admin.loading")}</p>;
  if (!session.user || !isSuperAdmin(session.user)) return <LoginCard desk="admin" onSuccess={reload} />;
  return <Desk name={session.user.fullName} onLogout={reload} />;
}

function Desk({ name, onLogout }: { name: string; onLogout: () => Promise<void> }) {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLiveQuery<AdminOverview>("/api/admin/overview");
  const [tab, setTab] = useState<"orders" | "chefs" | "drivers" | "emails" | "messages" | "users">("orders");
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const tabs = [
    ["orders", t("admin.tabOrders")],
    ["chefs", t("admin.tabChefs")],
    ["drivers", t("admin.tabDrivers")],
    ["users", t("admin.tabUsers")],
    ["emails", t("admin.tabEmails")],
    ["messages", t("admin.tabMessages")],
  ] as const;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await onLogout();
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-olive">{t("admin.kicker")}</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">{t("admin.title")}</h1>
          <p className="mt-2 text-sm text-muted">
            {name}
            {data ? ` · ${formatServiceDate(data.serviceDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveDot />
          <button type="button" className={quietButtonClass} onClick={() => { void reload(); setRefreshKey((value) => value + 1); }}>
            {t("admin.refresh")}
          </button>
          <button type="button" className={quietButtonClass} onClick={() => void logout()}>
            {t("menu.signOut")}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-terracotta-deep">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? primaryButtonClass : quietButtonClass} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {loading && !data && tab !== "emails" && tab !== "chefs" ? <p className="mt-8 text-sm text-muted">{t("admin.loading")}</p> : null}

      {tab === "orders" && data ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Books label={t("admin.today")} books={data.todayBooks} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Books label={t("admin.week")} books={data.weekBooks} />
          </div>
          <p className="mt-3 text-sm text-muted">
            {t("admin.booksNote", {
              delivery: formatMad(data.deliveryFeeMad),
              commission: formatMad(data.commissionPerMealMad),
              driverFee: formatMad(data.driverCommissionPerTripMad),
            })}
          </p>

          <section className="mt-8">
            <h2 className="font-display text-2xl">{t("admin.kitchens")}</h2>
            <ul className="mt-3 space-y-3 sm:hidden">
              {data.kitchens.map((kitchen) => (
                <li key={kitchen.chefId} className="rounded-3xl border border-line bg-card p-4 text-sm">
                  <p className="font-medium">{kitchen.kitchenName}</p>
                  <p className="text-xs text-muted">{kitchen.city}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-xs text-muted">{t("admin.orders")}</dt>
                      <dd>{kitchen.orders}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("admin.portions")}</dt>
                      <dd>{kitchen.portions}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("admin.revenue")}</dt>
                      <dd>{formatMad(kitchen.revenueMad)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("admin.commission")}</dt>
                      <dd>{formatMad(kitchen.commissionMad)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted">{t("admin.chefKeepsLine", { amount: formatMad(kitchen.payoutMad) })}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 hidden overflow-x-auto rounded-3xl border border-line bg-card sm:block">
              <table className="w-full min-w-[40rem] text-start text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 font-medium">{t("admin.kitchen")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.orders")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.portions")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.revenue")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.commission")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.chefKeeps")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.kitchens.map((kitchen) => (
                    <tr key={kitchen.chefId} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <span className="block font-medium">{kitchen.kitchenName}</span>
                        <span className="text-xs text-muted">{kitchen.city}</span>
                      </td>
                      <td className="px-4 py-3">{kitchen.orders}</td>
                      <td className="px-4 py-3">{kitchen.portions}</td>
                      <td className="px-4 py-3">{formatMad(kitchen.revenueMad)}</td>
                      <td className="px-4 py-3">{formatMad(kitchen.commissionMad)}</td>
                      <td className="px-4 py-3">{formatMad(kitchen.payoutMad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-2xl">{t("admin.recent")}</h2>
            <ul className="mt-3 space-y-3 sm:hidden">
              {data.recentOrders.map((order) => (
                <li key={order.id} className="rounded-3xl border border-line bg-card p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">
                      {order.quantity} × {order.mealTitle}
                    </p>
                    <StatusPill status={order.status} />
                  </div>
                  <p className="mt-1">{order.kitchenName}</p>
                  <dl className="mt-2 space-y-1">
                    <div>
                      <dt className="text-xs text-muted">{t("order.name")}</dt>
                      <dd className="font-medium">{order.customerName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("order.phone")}</dt>
                      <dd>{order.customerPhone}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("order.address")}</dt>
                      <dd>{order.deliveryAddress}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("order.notes")}</dt>
                      <dd>{order.customerNotes || "—"}</dd>
                    </div>
                  </dl>
                  <p className="mt-2">
                    {formatMad(order.totalMad)}
                    <span className="text-muted"> · {t("admin.orderCommission", { amount: formatMad(order.commissionMad) })}</span>
                  </p>
                  <p className="text-xs text-muted">{formatWhen(order.createdAt)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 hidden overflow-x-auto rounded-3xl border border-line bg-card sm:block">
              <table className="w-full min-w-[48rem] text-start text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 font-medium">{t("admin.when")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.kitchen")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.customer")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.meal")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.total")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.commission")}</th>
                    <th className="px-4 py-3 font-medium">{t("admin.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">{formatWhen(order.createdAt)}</td>
                      <td className="px-4 py-3">{order.kitchenName}</td>
                      <td className="px-4 py-3">
                        <span className="block font-medium">{order.customerName}</span>
                        <span className="block text-xs">{order.customerPhone}</span>
                        <span className="block text-xs text-muted">{order.deliveryAddress}</span>
                        <span className="mt-1 block text-xs">{order.customerNotes || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {order.quantity} × {order.mealTitle}
                      </td>
                      <td className="px-4 py-3">{formatMad(order.totalMad)}</td>
                      <td className="px-4 py-3">{formatMad(order.commissionMad)}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={order.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <ActiveTrips deliveries={data.activeDeliveries} />
        </>
      ) : null}
      {tab === "chefs" ? <div className="mt-8"><PendingChefs refreshKey={refreshKey} onToast={setToast} /></div> : null}
      {tab === "drivers" && data ? <DriverDesk drivers={data.drivers} onChanged={() => void reload()} onToast={setToast} /> : null}
      {tab === "users" ? <AllUsers /> : null}
      {tab === "emails" ? <EmailCaptures /> : null}
      {tab === "messages" ? <AdminChat /> : null}
      {toast ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1E1A15]/60 px-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-3xl bg-[#1E1A15] px-8 py-10 text-center shadow-2xl">
            <p className="font-display text-3xl leading-snug text-[#FAF6EF]">{toast}</p>
            <button type="button" className={`${primaryButtonClass} mt-8`} onClick={() => setToast(null)}>
              {t("order.close")}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function PendingChefs({ refreshKey, onToast }: { refreshKey: number; onToast: (message: string) => void }) {
  const { t } = useI18n();
  const [chefs, setChefs] = useState<Chef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Chef | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/chefs", { cache: "no-store" });
    const body = await readJson<{ chefs: Chef[] }>(response);
    setChefs(body.chefs);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("admin.loadFailed")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshKey, t]);

  async function review(chefId: string, status: "approved" | "rejected" | "postponed") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/chefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chefId, status }),
      });
      const body = await readJson<{ chef: Chef }>(response);
      const updatedChefObject = {
        ...body.chef,
        approvalStatus: status === "approved" ? "approved" : body.chef.approval_status,
        emailConfirmed: status === "approved" ? true : body.chef.approval_status === "approved",
        isActive: status === "rejected" ? false : true,
      };
      if (status === "approved") console.log("UPDATED CHEF:", updatedChefObject);
      setChefs((current) =>
        current.map((chef) =>
          chef.id === chefId ? { ...chef, approval_status: status === "postponed" ? chef.approval_status : status, is_active: updatedChefObject.isActive } : chef,
        ),
      );
      onToast(status === "rejected" ? t("admin.rejectedToast") : status === "approved" ? t("admin.approvedToast") : t("admin.postpone"));
      if (status !== "postponed") setOpen(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("admin.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  const pending = chefs.filter((chef) => chef.approval_status === "pending");
  const decided = chefs.filter((chef) => chef.approval_status === "approved" || chef.approval_status === "rejected");

  function renderChef(chef: Chef) {
    return (
      <li key={chef.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line px-3 py-3">
        {chef.cinDocumentId ? (
          <a href={`/api/admin/chef-documents/${chef.cinDocumentId}`} target="_blank" rel="noreferrer" className="block aspect-square w-36 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/chef-documents/${chef.cinDocumentId}`} alt="CIN" className="h-full w-full rounded-lg object-cover" />
          </a>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{chef.fullName}</p>
          <p className="text-sm text-muted">{chef.city} · {chef.approval_status}</p>
        </div>
        <button type="button" className={quietButtonClass} onClick={() => setOpen(chef)} aria-label={t("admin.review")}>
          <PenIcon /> {t("admin.review")}
        </button>
        <button type="button" className={quietButtonClass} onClick={() => void review(chef.id, "approved")}>
          {t("admin.approve")}
        </button>
        <button type="button" className={quietButtonClass} onClick={() => void review(chef.id, "rejected")}>
          {t("admin.reject")}
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-display text-2xl">{t("admin.pendingSection")}</h2>
        {pending.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.noChefs")}</p> : null}
        <ul className="mt-4 space-y-3">{pending.map(renderChef)}</ul>
      </section>
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-display text-2xl">{t("admin.decidedSection")}</h2>
        {decided.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.noChefs")}</p> : null}
        <ul className="mt-4 space-y-3">{decided.map(renderChef)}</ul>
      </section>
      {open ? (
        <ReviewModal
          busy={busy}
          view={chefView(open)}
          onClose={() => setOpen(null)}
          onAccept={() => void review(open.id, "approved")}
          onReject={() => void review(open.id, "rejected")}
          onPostpone={() => void review(open.id, "postponed")}
          onBalance={(balanceMad) => setOpen({ ...open, balanceMad })}
        />
      ) : null}
    </div>
  );
}

function chefView(chef: Chef): ReviewView {
  return {
    name: chef.fullName,
    phone: chef.phone ?? "",
    city: chef.city,
    bio: chef.bio,
    ownerId: chef.ownerId,
    balanceMad: chef.balanceMad,
    documents: chef.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      href: `/api/admin/chef-documents/${document.id}`,
    })),
    signatureUrl: chef.signature_data_url,
  };
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function Books({ label, books }: { label: string; books: FinanceSummary }) {
  const { t } = useI18n();
  return (
    <>
      <Stat label={t("admin.cash", { label })} value={formatMad(books.cashCollectedMad)} detail={t("admin.cashDetail", { orders: books.orders })} />
      <Stat label={t("admin.platformFee", { label })} value={formatMad(books.platformCommissionMad)} detail={t("admin.platformDetail", { portions: books.portions })} />
      <Stat label={t("admin.payouts", { label })} value={formatMad(books.chefPayoutMad)} detail={t("admin.payoutDetail")} />
      <Stat
        label={t("admin.driverPay", { label })}
        value={formatMad(books.driverEarningsMad)}
        detail={t("admin.driverDetail", { amount: formatMad(books.deliveryPlatformMad) })}
      />
    </>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

function DriverDesk({
  drivers,
  onChanged,
  onToast,
}: {
  drivers: DriverRecord[];
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<DriverRecord | null>(null);

  async function review(driverId: string, status: "approved" | "rejected" | "postponed") {
    setBusy(driverId);
    setError(null);
    try {
      const response = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, status }),
      });
      await readJson(response);
      onChanged();
      onToast(status === "rejected" ? t("admin.rejectedToast") : status === "approved" ? t("admin.approvedToast") : t("admin.postpone"));
      if (status !== "postponed") setOpen(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("admin.updateFailed"));
    } finally {
      setBusy(null);
    }
  }

  const pending = drivers.filter((driver) => driver.status === "pending");
  const decided = drivers.filter((driver) => driver.status === "approved" || driver.status === "rejected");

  function renderDriver(driver: DriverRecord) {
    return (
          <li key={driver.id} className="rounded-3xl border border-line bg-card p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{driver.fullName}</p>
                <p className="text-muted">
                  {driver.phone} · {driver.city} · {driver.vehicle}
                </p>
              </div>
              <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium capitalize">{driver.status}</span>
            </div>
            <p className="mt-2 text-xs text-muted">
              {t("admin.documents")} · {driver.documentsReady ? t("admin.documentsReady") : t("admin.documentsMissing")}
            </p>
            {driver.documents.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {driver.documents.map((document) => (
                  <a key={document.id} href={`/api/admin/documents/${document.id}`} target="_blank" rel="noreferrer" className="block aspect-square w-36 overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/admin/documents/${document.id}`}
                      alt={document.kind}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <span className="mt-1 block text-xs capitalize text-muted">{document.kind.replaceAll("_", " ")}</span>
                  </a>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={quietButtonClass} onClick={() => setOpen(driver)} aria-label={t("admin.review")}>
                <PenIcon /> {t("admin.review")}
              </button>
              {driver.status !== "approved" ? (
                <button type="button" className={primaryButtonClass} disabled={busy === driver.id} onClick={() => void review(driver.id, "approved")}>
                  {t("admin.approve")}
                </button>
              ) : null}
              {driver.status !== "rejected" ? (
                <button type="button" className={quietButtonClass} disabled={busy === driver.id} onClick={() => void review(driver.id, "rejected")}>
                  {t("admin.reject")}
                </button>
              ) : null}
            </div>
          </li>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
      <section>
        <h2 className="font-display text-2xl">{t("admin.pendingSection")}</h2>
        {pending.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.noDrivers")}</p> : null}
        <ul className="mt-3 space-y-3">{pending.map(renderDriver)}</ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">{t("admin.decidedSection")}</h2>
        {decided.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.noDrivers")}</p> : null}
        <ul className="mt-3 space-y-3">{decided.map(renderDriver)}</ul>
      </section>
      {open ? (
        <ReviewModal
          busy={busy === open.id}
          view={{
            name: open.fullName,
            phone: open.phone,
            city: open.city,
            bio: open.notes,
            ownerId: open.ownerId,
            balanceMad: open.balanceMad,
            signatureUrl: open.signature_data_url,
            documents: open.documents.map((document) => ({
              id: document.id,
              kind: document.kind,
              href: `/api/admin/documents/${document.id}`,
            })),
          }}
          onClose={() => setOpen(null)}
          onAccept={() => void review(open.id, "approved")}
          onReject={() => void review(open.id, "rejected")}
          onPostpone={() => void review(open.id, "postponed")}
          onBalance={() => onChanged()}
        />
      ) : null}
    </div>
  );
}

function AllUsers() {
  const { t } = useI18n();
  const [rows, setRows] = useState<StaffAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch("/api/admin/users", { cache: "no-store" })
        .then((response) => readJson<{ users: StaffAccount[] }>(response))
        .then((body) => setRows(body.users))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("admin.loadFailed")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t]);

  return (
    <section className="mt-8 rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">{t("admin.tabUsers")}</h2>
      {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="px-3 py-2 font-medium">{t("order.name")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.userRole")}</th>
              <th className="px-3 py-2 font-medium">{t("admin.userStatus")}</th>
              <th className="px-3 py-2 font-medium">{t("chef.city")}</th>
              <th className="px-3 py-2 font-medium">{t("auth.email")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.role}-${row.id}`} className="border-b border-line/70">
                <td className="px-3 py-3">{row.name}</td>
                <td className="px-3 py-3">{row.role}</td>
                <td className="px-3 py-3">{row.status}</td>
                <td className="px-3 py-3">{row.city}</td>
                <td className="px-3 py-3">{row.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmailCaptures() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Array<{ email: string; created_at: string; source: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch("/api/admin/captures", { cache: "no-store" })
        .then((response) => readJson<{ captures: Array<{ email: string; created_at: string; source: string }> }>(response))
        .then((body) => setRows(body.captures))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("admin.loadFailed")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section className="mt-8 rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">{t("admin.tabEmails")}</h2>
      {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.noEmails")}</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-3 py-2 font-medium">{t("auth.email")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.source")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.capturedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.source}-${row.email}-${row.created_at}`} className="border-b border-line/70">
                  <td className="px-3 py-3">{row.email}</td>
                  <td className="px-3 py-3">{row.source}</td>
                  <td className="px-3 py-3">{formatWhen(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ActiveTrips({ deliveries }: { deliveries: ActiveDelivery[] }) {
  const { t } = useI18n();
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">{t("admin.active")}</h2>
      {deliveries.length === 0 ? <p className="mt-3 text-sm text-muted">{t("admin.noTrips")}</p> : null}
      <ul className="mt-3 space-y-3">
        {deliveries.map((trip) => (
          <li key={trip.id} className="rounded-3xl border border-line bg-card p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {trip.quantity} × {trip.mealTitle}
                </p>
                <p className="text-muted">
                  {trip.driverName} · {trip.city}
                </p>
                <dl className="mt-2 space-y-1">
                  <div>
                    <dt className="text-xs text-muted">{t("order.name")}</dt>
                    <dd>{trip.customerName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t("order.phone")}</dt>
                    <dd>{trip.customerPhone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t("order.address")}</dt>
                    <dd>{trip.deliveryAddress}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t("order.notes")}</dt>
                    <dd>{trip.customerNotes || "—"}</dd>
                  </div>
                </dl>
              </div>
              <StatusPill status={trip.status} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
