import { redirect } from "next/navigation";
import { MailDashboard } from "@/components/mail/mail-dashboard";
import { getSession } from "@/lib/session";

export default async function MailPage() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.email) {
    redirect("/login");
  }

  return <MailDashboard email={session.email} />;
}
