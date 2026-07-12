import { NextResponse } from "next/server";
import { licenseGuard } from "@/lib/license-guard";
import { z } from "zod";
import {
  createAppContact,
  deleteAppContact,
  listAppContacts,
} from "@/lib/contacts-store";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const createSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  org: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
});

export async function GET() {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contacts = await listAppContacts(session.email);
    return NextResponse.json({ contacts });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load contacts";
    return NextResponse.json({ error: message, contacts: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid contact" },
        { status: 400 },
      );
    }

    const contact = await createAppContact(session.email, {
      fullName: parsed.data.fullName,
      email: parsed.data.email || undefined,
      phone: parsed.data.phone || undefined,
      org: parsed.data.org || undefined,
      description: parsed.data.description || undefined,
    });

    return NextResponse.json({ ok: true, contact });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create contact";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing contact id" }, { status: 400 });
    }

    const ok = await deleteAppContact(session.email, id);
    if (!ok) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete contact";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
