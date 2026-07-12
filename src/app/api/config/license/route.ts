import { NextResponse } from "next/server";
import { isLicenseActive } from "@/lib/license-store";
import {
  LICENSE_INACTIVE_MESSAGE,
  RLM_COMPANY_URL,
} from "@/lib/rlm-internal";

export const runtime = "nodejs";

/** Public license status for UI feature gates. */
export async function GET() {
  try {
    const active = await isLicenseActive();
    return NextResponse.json(
      {
        active,
        message: active ? null : LICENSE_INACTIVE_MESSAGE,
        companyUrl: RLM_COMPANY_URL,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({
      active: false,
      message: LICENSE_INACTIVE_MESSAGE,
      companyUrl: RLM_COMPANY_URL,
    });
  }
}
