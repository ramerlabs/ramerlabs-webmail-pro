import { redirect } from "next/navigation";
import { ExpensesPage } from "@/components/expenses/expenses-page";
import { getSession } from "@/lib/session";

export default async function ExpensesRoute() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.email) redirect("/login");
  return <ExpensesPage email={session.email} />;
}
