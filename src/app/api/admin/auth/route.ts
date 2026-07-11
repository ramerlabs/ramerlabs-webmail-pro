import { NextResponse } from "next/server";
import { z } from "zod";
import {
  changeAppAdminPassword,
  ensureDefaultAppAdmin,
  verifyAppAdmin,
} from "@/lib/app-admin";
import { getSession, requireAdminAccess } from "@/lib/session";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function GET() {
  await ensureDefaultAppAdmin();
  const session = await getSession();
  if (session.isLoggedIn && session.isAppAdmin) {
    return NextResponse.json({
      authenticated: true,
      isAppAdmin: true,
      username: session.email,
    });
  }
  const admin = await requireAdminAccess();
  if (admin) {
    return NextResponse.json({
      authenticated: true,
      isAppAdmin: Boolean(admin.isAppAdmin),
      username: admin.email,
    });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    await ensureDefaultAppAdmin();
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const user = await verifyAppAdmin(
      parsed.data.username,
      parsed.data.password,
    );
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const session = await getSession();
    session.isLoggedIn = true;
    session.isAppAdmin = true;
    session.email = user.username;
    session.password = "";
    await session.save();

    return NextResponse.json({
      ok: true,
      username: user.username,
      isDefaultPassword: user.isDefaultPassword,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await requireAdminAccess();
  if (!session?.isAppAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Current and new password (min 8 chars) required" },
        { status: 400 },
      );
    }

    const result = await changeAppAdminPassword(
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to change password";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
