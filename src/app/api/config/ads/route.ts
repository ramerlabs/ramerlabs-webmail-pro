import { NextResponse } from "next/server";
import { getAdminSettings } from "@/lib/admin-settings";

export const runtime = "nodejs";

/** Public flag used by the mail UI to show/hide Lacidaweb ads. */
export async function GET() {
  try {
    const settings = await getAdminSettings();
    return NextResponse.json(
      { adsEnabled: Boolean(settings.adsEnabled) },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json({ adsEnabled: true });
  }
}
