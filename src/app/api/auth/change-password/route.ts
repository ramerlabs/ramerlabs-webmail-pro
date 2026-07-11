import { NextResponse } from "next/server";
import { z } from "zod";
import { changeMailboxPassword } from "@/lib/cpanel";
import { verifyImapCredentials } from "@/lib/imap";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ip = getClientIp(request);
    const limited = rateLimit({
      key: `change-password:${session.email}:${ip}`,
      limit: 8,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
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

    const { currentPassword, newPassword } = parsed.data;
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from the current password." },
        { status: 400 },
      );
    }

    const currentOk = await verifyImapCredentials(
      session.email,
      currentPassword,
    );
    if (!currentOk.ok) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 },
      );
    }

    const result = await changeMailboxPassword(session.email, newPassword);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to update password" },
        { status: 502 },
      );
    }

    // Confirm the mailbox actually accepts the new password before success
    const verified = await verifyImapCredentials(session.email, newPassword);
    if (!verified.ok) {
      console.error(
        "[change-password] cPanel reported success but IMAP rejected new password",
        verified.error,
      );
      return NextResponse.json(
        {
          error:
            "Password update did not take effect on the mail server. Try a different password or contact support.",
        },
        { status: 502 },
      );
    }

    session.password = newPassword;
    await session.save();

    return NextResponse.json({
      ok: true,
      message: "Password updated. Use your new password next time you sign in.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to change password";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
