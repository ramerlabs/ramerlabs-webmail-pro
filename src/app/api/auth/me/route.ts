import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getSession, getSettings } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.email) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const isAdmin =
    Boolean(session.isAppAdmin) || isAdminEmail(session.email);

  return NextResponse.json({
    authenticated: true,
    email: session.email,
    settings: getSettings(session),
    isAdmin,
    isAppAdmin: Boolean(session.isAppAdmin),
  });
}
