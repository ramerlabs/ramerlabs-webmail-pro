import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  let loggedIn = false;
  try {
    const session = await getSession();
    loggedIn = Boolean(session.isLoggedIn && session.email);
  } catch {
    loggedIn = false;
  }

  redirect(loggedIn ? "/mail" : "/login");
}
