import { NextResponse } from "next/server";
import { requireActiveLicense } from "@/lib/license-store";

/** Returns a 403 response when the product license is inactive; otherwise null. */
export async function licenseGuard(): Promise<NextResponse | null> {
  const license = await requireActiveLicense();
  if (license.ok) return null;
  return NextResponse.json(
    { error: license.message, code: "license_inactive" },
    { status: 403 },
  );
}
