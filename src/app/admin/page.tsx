import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { ensureDefaultAppAdmin } from "@/lib/app-admin";
import { requireAdminAccess } from "@/lib/session";

export default async function AdminPage() {
  await ensureDefaultAppAdmin();
  const session = await requireAdminAccess();
  if (!session) {
    redirect("/admin/login");
  }
  return (
    <AdminDashboard
      email={session.email}
      isAppAdmin={Boolean(session.isAppAdmin)}
    />
  );
}
