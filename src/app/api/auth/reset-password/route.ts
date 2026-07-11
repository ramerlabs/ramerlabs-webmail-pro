import { NextResponse } from "next/server";
import { verifySignedPayload } from "@/lib/auth-crypto";
import { changeMailboxPassword } from "@/lib/cpanel";
import { verifyImapCredentials } from "@/lib/imap";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limited = rateLimit({
      key: `reset:${ip}`,
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
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const payload = verifySignedPayload<{
      type: string;
      email: string;
    }>(parsed.data.token);

    if (!payload || payload.type !== "reset" || !payload.email) {
      return NextResponse.json(
        { error: "Reset link is invalid or expired." },
        { status: 400 },
      );
    }

    const email = payload.email.toLowerCase();
    const result = await changeMailboxPassword(email, parsed.data.password);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to update password" },
        { status: 502 },
      );
    }

    const verified = await verifyImapCredentials(email, parsed.data.password);
    if (!verified.ok) {
      console.error(
        "[reset-password] cPanel reported success but IMAP rejected new password for",
        email,
        verified.error,
      );
      return NextResponse.json(
        {
          error:
            "Password update did not take effect on the mail server. Try a different password or request a new reset link.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Password updated. You can sign in with your new password.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Reset failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
