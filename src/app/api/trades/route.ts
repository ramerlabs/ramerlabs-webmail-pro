import { NextResponse } from "next/server";
import { licenseGuard } from "@/lib/license-guard";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import {
  createTrade,
  deleteTrade,
  listTrades,
  updateTrade,
} from "@/lib/trading-journal-store";

export const runtime = "nodejs";

const createSchema = z.object({
  date: z.string().min(1),
  symbol: z.string().min(1).max(40),
  side: z.enum(["long", "short"]),
  status: z.enum(["open", "closed"]).optional(),
  entryPrice: z.number().finite(),
  exitPrice: z.number().finite().nullable().optional(),
  quantity: z.number().positive(),
  fees: z.number().min(0).optional(),
  pnl: z.number().finite().nullable().optional(),
  setup: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
});

export async function GET() {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const trades = await listTrades(session.email);
    const closed = trades.filter((t) => t.pnl != null);
    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const wins = closed.filter((t) => (t.pnl || 0) > 0).length;
    return NextResponse.json({
      trades,
      stats: {
        count: trades.length,
        open: trades.filter((t) => t.status === "open").length,
        closed: closed.length,
        totalPnl: Number(totalPnl.toFixed(4)),
        winRate: closed.length
          ? Number(((wins / closed.length) * 100).toFixed(1))
          : null,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load trades";
    return NextResponse.json({ error: message, trades: [] }, { status: 500 });
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
        { error: parsed.error.issues[0]?.message || "Invalid trade" },
        { status: 400 },
      );
    }

    const trade = await createTrade(session.email, {
      ...parsed.data,
      exitPrice: parsed.data.exitPrice ?? null,
      fees: parsed.data.fees ?? 0,
      setup: parsed.data.setup || "",
      notes: parsed.data.notes || "",
    });
    return NextResponse.json({ ok: true, trade });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create trade";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const licenseBlocked = await licenseGuard();
  if (licenseBlocked) return licenseBlocked;

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update" },
        { status: 400 },
      );
    }

    const { id, ...patch } = parsed.data;
    const trade = await updateTrade(session.email, id, patch);
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, trade });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update trade";
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
      return NextResponse.json({ error: "Missing trade id" }, { status: 400 });
    }
    const ok = await deleteTrade(session.email, id);
    if (!ok) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete trade";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
