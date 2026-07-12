import { NextResponse } from "next/server";
import { licenseGuard } from "@/lib/license-guard";
import { fetchMailQuota, formatQuotaBytes } from "@/lib/quota";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const quota = await fetchMailQuota(session.email, session.password);
    return NextResponse.json({
      ...quota,
      usedLabel: formatQuotaBytes(quota.used),
      limitLabel: formatQuotaBytes(quota.limit),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load quota";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
