import { NextResponse } from "next/server";
import { appendToDraftsFolder } from "@/lib/imap";
import { requireSession } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  to: z.string().email().optional().or(z.literal("")),
  subject: z.string().max(998).optional().default(""),
  body: z.string().optional().default(""),
});

export async function POST(request: Request) {
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

    const { to, subject, body: text } = parsed.data;
    if (!to && !subject && !text) {
      return NextResponse.json(
        { error: "Draft is empty" },
        { status: 400 },
      );
    }

    const saved = await appendToDraftsFolder(session.email, session.password, {
      to: to || session.email,
      subject: subject || "(no subject)",
      text: text || "",
    });

    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error || "Failed to save draft" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, folder: saved.path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
