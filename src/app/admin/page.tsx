import { AdminDashboard } from "@/components/admin-dashboard";
import { ADMIN_AUTH_BYPASSED } from "@/lib/super-admin";

export default function AdminPage() {
  return (
    <>
      {ADMIN_AUTH_BYPASSED ? (
        <p className="fixed inset-x-0 top-0 z-[300] bg-red-600 px-4 py-2 text-center text-sm font-bold text-white">
          Temporary local admin preview is active (RIGH_LOCAL_ADMIN_PREVIEW). UI-only convenience on
          isolated righ_test — production auth and API checks stay mandatory elsewhere. Disable the
          flag to restore the login screen.
        </p>
      ) : null}
      <div className={ADMIN_AUTH_BYPASSED ? "pt-9" : undefined}>
        <AdminDashboard localPreviewActive={ADMIN_AUTH_BYPASSED} />
      </div>
    </>
  );
}
