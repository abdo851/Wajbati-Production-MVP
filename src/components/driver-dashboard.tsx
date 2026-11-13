"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DocumentUpload } from "@/components/document-upload";
import { ProfileExtras } from "@/components/profile-extras";
import { DriverAuth } from "@/components/driver-auth";
import { PhotoGallery, PenButton } from "@/components/photo-gallery";
import { ProfilePhoto } from "@/components/site-header";
import { SecureChat } from "@/components/secure-chat";
import { WalletPanel } from "@/components/wallet-panel";
import { useI18n } from "@/components/language";
import { LiveDot, inputClass, primaryButtonClass, quietButtonClass, StatusPill } from "@/components/ui";
import { useLiveQuery } from "@/components/use-live-query";
import { useSession } from "@/components/use-session";
import { formatMad } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { DeliveryJob, DriverBoard } from "@/lib/types";

export function DriverDashboard() {
  const { t } = useI18n();
  const { session, error, reload } = useSession();

  useEffect(() => {
    document.title = `${t("nav.drive")} · Wajbati`;
  }, [t]);

  if (error && !session) {
    return <p className="px-4 py-16 text-sm text-terracotta-deep">{error}</p>;
  }
  if (!session) {
    return <p className="px-4 py-16 text-sm text-muted">{t("driver.checking")}</p>;
  }
  if (!session.user) {
    return <DriverAuth />;
  }
  if (session.user.role !== "driver") {
    const href = session.user.role === "customer" ? "/account" : "/";
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-4xl">{t("gate.notDriver")}</h1>
        <p className="mt-3 text-base leading-7 text-muted">{t("gate.notDriverBody")}</p>
        <Link href={href} className={`${primaryButtonClass} mt-6`}>
          {t("gate.openDashboard")}
        </Link>
      </main>
    );
  }

  if (session.user.documentsReady === false && session.user.vehicle) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <DocumentUpload vehicle={session.user.vehicle} onDone={() => void reload()} />
      </main>
    );
  }

  return (
    <Route
      name={session.user.fullName}
      city={session.user.city ?? ""}
      bio={session.user.bio ?? ""}
      avatar={session.user.avatarDataUrl ?? null}
      gallery={session.user.gallery ?? []}
      onLogout={reload}
      onProfileSaved={reload}
    />
  );
}

function Route({
  name,
  city,
  bio,
  avatar,
  gallery,
  onLogout,
  onProfileSaved,
}: {
  name: string;
  city: string;
  bio: string;
  avatar: string | null;
  gallery: string[];
  onLogout: () => Promise<void>;
  onProfileSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [editingProfile, setEditingProfile] = useState(false);
  const [album, setAlbum] = useState(gallery);
  const { data, error, reconnecting, reload } = useLiveQuery<DriverBoard>("/api/driver/board");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await onLogout();
  }

  async function post(url: string, body: Record<string, string>) {
    setBusy(body.orderId);
    setActionError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readJson(response);
      await reload();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t("driver.updateFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-olive">{city || t("driver.yourCity")}</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">{name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LiveDot />
          <button type="button" className={quietButtonClass} onClick={() => void logout()}>
            {t("menu.signOut")}
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-line bg-card p-5 shadow-[0_8px_30px_rgba(30,26,21,0.08)]">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative">
            <ProfilePhoto src={avatar} label={name} className="size-32" />
            <PenButton label={t("profile.edit")} onClick={() => setEditingProfile((open) => !open)} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-4xl leading-tight">{name}</h2>
            <button type="button" className={`${quietButtonClass} mt-4`} onClick={() => setEditingProfile((open) => !open)}>
              {t("profile.edit")}
            </button>
          </div>
        </div>
        <p className="mt-6 text-sm font-medium text-muted">{t("profile.bio")}</p>
        <p className="mt-1 text-base leading-7">{bio || "—"}</p>
        <PhotoGallery images={album} onChange={setAlbum} />
        <p className="mt-3 text-sm font-medium text-muted">{t("chef.city")}</p>
        <p className="mt-1 text-base text-terracotta">{city || "—"}</p>
        {editingProfile ? <ProfileExtras role="driver" onSaved={onProfileSaved} /> : null}
      </section>
      <WalletPanel />
      {data ? <Earnings board={data} /> : null}
      {error ? <p className="mt-4 text-sm text-terracotta-deep">{error}</p> : null}
      {reconnecting && data ? <p className="mt-4 text-sm text-muted">{t("live.reconnecting")}</p> : null}
      {actionError ? <p className="mt-4 text-sm text-terracotta-deep">{actionError}</p> : null}
      {!data && !error ? (
        <p className="mt-8 text-sm text-muted">{reconnecting ? t("live.reconnecting") : t("driver.loading")}</p>
      ) : null}

      {data && data.accountStatus !== "approved" ? (
        <p className="mt-6 rounded-3xl border border-line bg-card p-4 text-sm leading-6">
          {data.accountStatus === "pending"
            ? t("driver.pending")
            : t("driver.declined")}
        </p>
      ) : null}

      {data && data.accountStatus === "approved" ? (
        <section id="orders" className="mt-8">
          <h2 className="font-display text-2xl">{t("driver.ready", { city: data.city })}</h2>
          {data.available.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("driver.noneWaiting")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.available.map((job) => (
                <JobCard key={job.id} job={job}>
                  <button
                    type="button"
                    className={`${primaryButtonClass} w-full`}
                    disabled={busy === job.id}
                    onClick={() => void post("/api/driver/accept", { orderId: job.id })}
                  >
                    {busy === job.id ? t("driver.taking") : t("driver.accept")}
                  </button>
                </JobCard>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {data && data.active.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{t("driver.trip")}</h2>
          <ul className="mt-3 space-y-3">
            {data.active.map((job) => (
              <JobCard key={job.id} job={job}>
                <div className="grid gap-2">
                  {job.status === "assigned" ? (
                    <>
                      <button
                        type="button"
                        className={primaryButtonClass}
                        disabled={busy === job.id}
                        onClick={() => void post("/api/driver/status", { orderId: job.id, action: "pick_up" })}
                      >
                        {t("driver.pickedUp")}
                      </button>
                      <button
                        type="button"
                        className={quietButtonClass}
                        disabled={busy === job.id}
                        onClick={() => void post("/api/driver/status", { orderId: job.id, action: "release" })}
                      >
                        {t("driver.release")}
                      </button>
                    </>
                  ) : (
                    <DeliverBox
                      busy={busy === job.id}
                      onDeliver={(code) => void post("/api/driver/status", { orderId: job.id, action: "deliver", code })}
                    />
                  )}
                  <SecureChat orderId={job.id} />
                </div>
              </JobCard>
            ))}
          </ul>
        </section>
      ) : null}

      {data && data.completed.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{t("driver.finished")}</h2>
          <ul className="mt-3 space-y-3">
            {data.completed.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function DeliverBox({ busy, onDeliver }: { busy: boolean; onDeliver: (code: string) => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onDeliver(code);
      }}
    >
      <label className="text-sm font-medium">
        {t("track.ask")}
        <input
          className={`${inputClass} mt-1.5 text-center font-display text-3xl tracking-[0.3em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
          required
        />
      </label>
      <button type="submit" className={primaryButtonClass} disabled={busy || code.length !== 4}>
        {busy ? t("track.checking") : t("track.confirm")}
      </button>
    </form>
  );
}

function Earnings({ board }: { board: DriverBoard }) {
  const { t } = useI18n();
  return (
    <div className="mt-6 grid grid-cols-3 gap-2">
      <article className="rounded-3xl border border-line bg-card p-3">
        <p className="text-xs text-muted">{t("driver.trips")}</p>
        <p className="mt-1 font-display text-2xl">{board.earnings.trips}</p>
      </article>
      <article className="rounded-3xl border border-line bg-card p-3">
        <p className="text-xs text-muted">{t("driver.commission")}</p>
        <p className="mt-1 font-display text-2xl">{formatMad(board.earnings.commissionMad)}</p>
      </article>
      <article className="rounded-3xl border border-line bg-card p-3">
        <p className="text-xs text-muted">{t("driver.youKeep")}</p>
        <p className="mt-1 font-display text-2xl">{formatMad(board.earnings.netMad)}</p>
      </article>
    </div>
  );
}

function JobCard({ job, children }: { job: DeliveryJob; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <li className="rounded-3xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {job.quantity} × {job.mealTitle}
          </p>
          <p className="mt-1 text-sm text-muted">
            {job.kitchenName} · {job.city}
          </p>
        </div>
        <StatusPill status={job.status} />
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        <div>
          <dt className="text-xs text-muted">{t("order.name")}</dt>
          <dd className="font-medium">{job.customerName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("order.phone")}</dt>
          <dd>{job.customerPhone}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("order.address")}</dt>
          <dd>{job.deliveryAddress}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("order.notes")}</dt>
          <dd>{job.customerNotes || "—"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm">{t("pay.cash")}</p>
      <p className="mt-2 text-sm">
        {t("driver.feeLine", { fee: formatMad(job.deliveryFeeMad), commission: formatMad(job.driverCommissionMad), net: formatMad(job.driverNetMad) })}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </li>
  );
}
