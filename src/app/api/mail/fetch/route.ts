import { NextResponse } from "next/server";
import { fetchLatestEmails, type MailFolder } from "@/lib/imap";
import { requireSession } from "@/lib/session";
import { fetchMailSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = fetchMailSchema.safeParse({
      folder: searchParams.get("folder") || "INBOX",
      limit: searchParams.get("limit") || "20",
      search: searchParams.get("search") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid query" },
        { status: 400 },
      );
    }

    const { folder, limit, search } = parsed.data;
    const messages = await fetchLatestEmails(session.email, session.password, {
      folder: folder as MailFolder,
      limit,
      search,
    });

    return NextResponse.json({
      ok: true,
      folder,
      count: messages.length,
      messages,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch mail";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
