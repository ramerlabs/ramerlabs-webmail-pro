import { redirect } from "next/navigation";
import { TodosPage } from "@/components/todos/todos-page";
import { getSession } from "@/lib/session";

export default async function TodosRoute() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.email) redirect("/login");
  if (!session.password) redirect("/admin");
  return <TodosPage email={session.email} />;
}
