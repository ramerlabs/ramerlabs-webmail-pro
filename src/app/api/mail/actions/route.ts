import { NextResponse } from "next/server";
import { licenseGuard } from "@/lib/license-guard";
import { applyMailActions, type MailFolder } from "@/lib/imap";
import { requireSession } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  folder: z.enum(["INBOX", "Sent", "Drafts", "Trash", "Junk", "Archive"]),
  uids: z.array(z.number().int().positive()).min(1).max(50),
  action: z.enum(["read", "unread", "trash", "delete", "junk", "archive"]),
});

export async function POST(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const result = await applyMailActions(session.email, session.password, {
      folder: parsed.data.folder as MailFolder,
      uids: parsed.data.uids,
      action: parsed.data.action,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Action failed" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
