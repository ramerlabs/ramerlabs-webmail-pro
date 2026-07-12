import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "RamerLabs Webmail Pro",
  description:
    "Modern branded webmail for your domain — cPanel mailboxes, inbox, contacts, calendar, and licensed admin control.",
};

export default async function HomePage() {
  try {
    const session = await getSession();
    if (session.isLoggedIn && session.email) {
      redirect(session.isAppAdmin ? "/admin" : "/mail");
    }
  } catch {
    /* first boot without session secret */
  }

  return <LandingPage />;
}
