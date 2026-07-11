import { redirect } from "next/navigation";
import { CalendarPage } from "@/components/calendar/calendar-page";
import { getSession } from "@/lib/session";

export default async function CalendarRoute() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.email) redirect("/login");
  return <CalendarPage email={session.email} />;
}
