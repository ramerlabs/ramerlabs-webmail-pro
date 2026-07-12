import { redirect } from "next/navigation";
import { TradingJournalPage } from "@/components/trades/trading-journal-page";
import { getSession } from "@/lib/session";

export default async function TradesRoute() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.email) redirect("/login");
  if (!session.password) redirect("/admin");
  return <TradingJournalPage email={session.email} />;
}
