import { NextResponse } from "next/server";
import { hydrateProcessEnvFromConfig } from "@/lib/app-config";
import { listCpanelMailDomains } from "@/lib/cpanel";
import { requireAdminAccess } from "@/lib/session";

export const runtime = "nodejs";

/** List domains from cPanel that can host email accounts. */
export async function GET() {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await hydrateProcessEnvFromConfig();
    const result = await listCpanelMailDomains();
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to list domains", domains: [] },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, domains: result.domains });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list domains";
    return NextResponse.json({ error: message, domains: [] }, { status: 500 });
  }
}
