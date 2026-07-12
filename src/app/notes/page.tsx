import { redirect } from "next/navigation";
import { NotesPage } from "@/components/notes/notes-page";
import { getSession } from "@/lib/session";

export default async function NotesRoute() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.email) redirect("/login");
  if (!session.password) redirect("/admin");
  return <NotesPage email={session.email} />;
}
