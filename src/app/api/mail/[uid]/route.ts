import { NextResponse } from "next/server";
import { fetchEmailByUid, type MailFolder } from "@/lib/imap";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { uid: uidParam } = await context.params;
    const uid = Number(uidParam);
    if (!Number.isFinite(uid) || uid < 1) {
      return NextResponse.json({ error: "Invalid UID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const folder = (searchParams.get("folder") || "INBOX") as MailFolder;

    const message = await fetchEmailByUid(
      session.email,
      session.password,
      uid,
      folder,
    );

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
