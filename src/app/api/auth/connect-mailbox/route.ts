import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyImapCredentials } from "@/lib/imap";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  password: z.string().min(1, "Mailbox password is required"),
});

/**
 * Attach IMAP credentials to an installer-admin session so Mail / send works
 * without logging out. Email stays the signed-in admin address.
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
    const password = parsed.data.password;
    const verify = await verifyImapCredentials(email, password);

    if (!verify.ok) {
      return NextResponse.json(
        {
          error:
            verify.error ||
            `IMAP login failed for ${email}. Create this mailbox in cPanel (or use its real password), then try again.`,
        },
        { status: 401 },
      );
    }

    session.password = password;
    await session.save();

    return NextResponse.json({
      ok: true,
      hasMailbox: true,
      email,
      message: "Mailbox connected. Mail and compose are available.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect mailbox";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
