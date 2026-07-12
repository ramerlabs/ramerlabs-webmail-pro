import { NextResponse } from "next/server";
import { getAdminSettings } from "@/lib/admin-settings";
import { getRuntimeConfig } from "@/lib/app-config";

export const runtime = "nodejs";

/** Public ads config used by the mail UI. */
export async function GET() {
  try {
    const [settings, runtime] = await Promise.all([
      getAdminSettings(),
      getRuntimeConfig(),
    ]);
    const placementId =
      settings.adsPlacementId?.trim() ||
      runtime.lacidawebPlacementId?.trim() ||
      process.env.LACIDAWEB_PLACEMENT_ID ||
      "cmreflbz9001gjw04x1ylhtfo";

    return NextResponse.json(
      {
        adsEnabled: Boolean(settings.adsEnabled),
        placementId,
        customHtml: settings.adsCustomHtml || "",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json({
      adsEnabled: true,
      placementId: "cmreflbz9001gjw04x1ylhtfo",
      customHtml: "",
    });
  }
}
