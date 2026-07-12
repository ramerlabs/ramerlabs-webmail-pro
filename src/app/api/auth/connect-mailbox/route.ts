import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureAdminMailboxAccess } from "@/lib/admin-mailbox";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  password: z.string().min(1, "Mailbox password is required"),
});

/**
 * Attach IMAP credentials to an installer-admin session.
 * Creates or syncs the admin@ cPanel mailbox when needed so Mail works
 * like a normal email account.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.password) {
      return NextResponse.json({
        ok: true,
        hasMailbox: true,
        email: session.email,
        message: "Mailbox already connected.",
      });
    }

    if (!session.isAppAdmin) {
      return NextResponse.json(
        { error: "Only the installer admin can connect a mailbox this way." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const email = session.email;
    const mailbox = await ensureAdminMailboxAccess(
      email,
      parsed.data.password,
    );

    if (!mailbox.ok || !mailbox.password) {
      return NextResponse.json(
        {
          error:
            mailbox.error ||
            `Could not unlock Mail for ${email}. Check cPanel API settings and IMAP host.`,
        },
        { status: 401 },
      );
    }

    session.password = mailbox.password;
    await session.save();

    return NextResponse.json({
      ok: true,
      hasMailbox: true,
      email,
      message: "Mailbox ready. Opening Mail like a normal account.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect mailbox";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
