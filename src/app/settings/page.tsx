import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/settings/settings-page";
import { getSession } from "@/lib/session";

export default async function SettingsRoute() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.email) redirect("/login");
  if (!session.password) redirect("/admin");
  return <SettingsPage email={session.email} />;
}
