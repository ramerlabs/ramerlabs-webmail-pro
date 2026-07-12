import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { getAdminSettings } from "@/lib/admin-settings";
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

  try {
    const settings = await getAdminSettings();
    if (settings.landingEnabled === false) {
      redirect("/login");
    }
  } catch {
    /* show landing if settings unavailable */
  }

  return <LandingPage />;
}
