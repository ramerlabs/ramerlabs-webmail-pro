import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import {
  getAdminSettings,
  normalizeBlockedEmail,
  saveAdminSettings,
} from "@/lib/admin-settings";
import { requireAdminAccess } from "@/lib/session";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    adsEnabled: z.boolean().optional(),
    signupEnabled: z.boolean().optional(),
    blockedEmails: z.array(z.string()).optional(),
    blockEmail: z.string().optional(),
    unblockEmail: z.string().optional(),
  })
  .refine(
    (v) =>
      v.adsEnabled !== undefined ||
      v.signupEnabled !== undefined ||
      v.blockedEmails !== undefined ||
      v.blockEmail !== undefined ||
      v.unblockEmail !== undefined,
    {
      message:
        "Provide adsEnabled, signupEnabled, blockedEmails, blockEmail, and/or unblockEmail",
    },
  );

export async function GET() {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAdminSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const current = await getAdminSettings();
    let blockedEmails = [...current.blockedEmails];

    if (parsed.data.blockedEmails !== undefined) {
      blockedEmails = parsed.data.blockedEmails;
    }

    if (parsed.data.blockEmail) {
      const email = normalizeBlockedEmail(parsed.data.blockEmail);
      if (!email) {
        return NextResponse.json(
          { error: "Enter a valid email or username to block" },
          { status: 400 },
        );
      }
      if (isAdminEmail(email)) {
        return NextResponse.json(
          { error: "Admin accounts cannot be blocked." },
          { status: 400 },
        );
      }
      if (!blockedEmails.includes(email)) blockedEmails.push(email);
    }

    if (parsed.data.unblockEmail) {
      const email = normalizeBlockedEmail(parsed.data.unblockEmail);
      if (email) {
        blockedEmails = blockedEmails.filter((e) => e !== email);
      }
    }

    const settings = await saveAdminSettings({
      adsEnabled: parsed.data.adsEnabled,
      signupEnabled: parsed.data.signupEnabled,
      blockedEmails,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
