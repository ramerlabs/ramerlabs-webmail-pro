import { NextResponse } from "next/server";
import {
  getAdminSettings,
  signupDisabledMessage,
} from "@/lib/admin-settings";
import { getMailDomain } from "@/lib/env";

export const runtime = "nodejs";

/** Public signup availability for the signup page. */
export async function GET() {
  try {
    const domain = getMailDomain();
    const settings = await getAdminSettings();
    const signupEnabled = settings.signupEnabled !== false;
    return NextResponse.json(
      {
        signupEnabled,
        domain,
        message: signupEnabled ? null : signupDisabledMessage(domain),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    const domain = process.env.MAIL_DOMAIN || "yourdomain.com";
    return NextResponse.json({
      signupEnabled: true,
      domain,
      message: null,
    });
  }
}
