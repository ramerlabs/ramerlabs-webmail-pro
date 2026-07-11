import { redirect } from "next/navigation";
import { ContactsPage } from "@/components/contacts/contacts-page";
import { getSession } from "@/lib/session";

export default async function ContactsRoute() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.email) redirect("/login");
  return <ContactsPage email={session.email} />;
}
