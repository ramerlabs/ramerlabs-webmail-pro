import { NextResponse } from "next/server";
import {
  fetchAccountDiskUsage,
  listMailboxesWithDisk,
} from "@/lib/cpanel";
import { getMailDomain } from "@/lib/env";
import { formatQuotaBytes } from "@/lib/quota";
import { requireAdminAccess } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [disk, mailboxes] = await Promise.all([
      fetchAccountDiskUsage(),
      listMailboxesWithDisk(),
    ]);

    return NextResponse.json({
      domain: getMailDomain(),
      storage: {
        available: disk.available,
        percent: disk.percent,
        usedBytes: disk.usedBytes,
        limitBytes: disk.limitBytes,
        usedLabel: formatQuotaBytes(disk.usedBytes),
        limitLabel: formatQuotaBytes(disk.limitBytes),
        error: disk.error,
      },
      mailboxes: mailboxes.mailboxes,
      mailboxesError: mailboxes.ok ? undefined : mailboxes.error,
      mailboxCount: mailboxes.mailboxes.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load admin stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
