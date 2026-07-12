import { NextResponse } from "next/server";
import {
  getAdminSettings,
  signupDisabledMessage,
} from "@/lib/admin-settings";
import { getMailDomain } from "@/lib/env";
import { isLicenseActive } from "@/lib/license-store";
import {
  LICENSE_INACTIVE_MESSAGE,
  RLM_COMPANY_URL,
} from "@/lib/rlm-internal";

export const runtime = "nodejs";

/** Public signup availability for the signup page. */
export async function GET() {
  try {
    const domain = getMailDomain();
    const [settings, licenseActive] = await Promise.all([
      getAdminSettings(),
      isLicenseActive(),
    ]);
    const signupOpen = settings.signupEnabled !== false;
    const signupEnabled = signupOpen && licenseActive;

    let message: string | null = null;
    if (!licenseActive) {
      message = LICENSE_INACTIVE_MESSAGE;
    } else if (!signupOpen) {
      message = signupDisabledMessage(domain);
    }

    return NextResponse.json(
      {
        signupEnabled,
        licenseActive,
        domain,
        message,
        companyUrl: RLM_COMPANY_URL,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    const domain = process.env.MAIL_DOMAIN || "yourdomain.com";
    return NextResponse.json({
      signupEnabled: false,
      licenseActive: false,
      domain,
      message: LICENSE_INACTIVE_MESSAGE,
      companyUrl: RLM_COMPANY_URL,
    });
  }
}
