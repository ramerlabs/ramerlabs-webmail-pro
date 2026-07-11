import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";
import { normalizeEmail } from "@/lib/auth-crypto";

export type TradeSide = "long" | "short";
export type TradeStatus = "open" | "closed";

export interface TradeEntry {
  id: string;
  date: string;
  symbol: string;
  side: TradeSide;
  status: TradeStatus;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  fees: number;
  pnl: number | null;
  setup: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

function storeKey(email: string): string {
  return `webmail:trades:${normalizeEmail(email)}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function localStorePath(): string {
  return path.join(process.cwd(), ".data", "trades.json");
}

async function readLocalStore(): Promise<Record<string, TradeEntry[]>> {
  try {
    const raw = await readFile(localStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, TradeEntry[]>;
  } catch {
    return {};
  }
}

async function writeLocalStore(
  data: Record<string, TradeEntry[]>,
): Promise<void> {
  const file = localStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function getTrades(email: string): Promise<TradeEntry[]> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<TradeEntry[]>(storeKey(email));
    return Array.isArray(value) ? value : [];
  }
  const store = await readLocalStore();
  return store[normalizeEmail(email)] || [];
}

async function saveTrades(
  email: string,
  trades: TradeEntry[],
): Promise<TradeEntry[]> {
  const normalized = normalizeEmail(email);
  const redis = getRedis();
  if (redis) {
    await redis.set(storeKey(normalized), trades);
    return trades;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "Trading journal requires Upstash Redis on Vercel. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  const store = await readLocalStore();
  store[normalized] = trades;
  await writeLocalStore(store);
  return trades;
}

export function computePnl(input: {
  side: TradeSide;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  fees: number;
}): number | null {
  if (input.exitPrice == null || !Number.isFinite(input.exitPrice)) return null;
  const raw =
    input.side === "long"
      ? (input.exitPrice - input.entryPrice) * input.quantity
      : (input.entryPrice - input.exitPrice) * input.quantity;
  return Number((raw - (input.fees || 0)).toFixed(4));
}

export async function listTrades(email: string): Promise<TradeEntry[]> {
  const trades = await getTrades(email);
  return [...trades].sort((a, b) => b.date.localeCompare(a.date));
}

export async function createTrade(
  email: string,
  input: Omit<TradeEntry, "id" | "pnl" | "createdAt" | "updatedAt" | "status"> & {
    status?: TradeStatus;
    pnl?: number | null;
  },
): Promise<TradeEntry> {
  const now = new Date().toISOString();
  const status =
    input.status ||
    (input.exitPrice != null && Number.isFinite(input.exitPrice)
      ? "closed"
      : "open");
  const pnl =
    input.pnl !== undefined
      ? input.pnl
      : computePnl({
          side: input.side,
          entryPrice: input.entryPrice,
          exitPrice: input.exitPrice,
          quantity: input.quantity,
          fees: input.fees,
        });

  const item: TradeEntry = {
    id: randomUUID(),
    date: input.date,
    symbol: input.symbol.trim().toUpperCase(),
    side: input.side,
    status,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    quantity: input.quantity,
    fees: input.fees || 0,
    pnl,
    setup: (input.setup || "").trim(),
    notes: (input.notes || "").trim(),
    createdAt: now,
    updatedAt: now,
  };

  const trades = await getTrades(email);
  trades.unshift(item);
  await saveTrades(email, trades);
  return item;
}

export async function updateTrade(
  email: string,
  id: string,
  patch: Partial<
    Omit<TradeEntry, "id" | "createdAt" | "updatedAt" | "pnl">
  > & { pnl?: number | null },
): Promise<TradeEntry | null> {
  const trades = await getTrades(email);
  const idx = trades.findIndex((t) => t.id === id);
  if (idx < 0) return null;

  const current = trades[idx];
  const nextBase = {
    ...current,
    ...patch,
    symbol:
      patch.symbol !== undefined
        ? patch.symbol.trim().toUpperCase()
        : current.symbol,
    setup:
      patch.setup !== undefined ? patch.setup.trim() : current.setup,
    notes:
      patch.notes !== undefined ? patch.notes.trim() : current.notes,
    updatedAt: new Date().toISOString(),
  };

  const status =
    nextBase.status ||
    (nextBase.exitPrice != null ? "closed" : "open");

  const pnl =
    patch.pnl !== undefined
      ? patch.pnl
      : computePnl({
          side: nextBase.side,
          entryPrice: nextBase.entryPrice,
          exitPrice: nextBase.exitPrice,
          quantity: nextBase.quantity,
          fees: nextBase.fees,
        });

  const next: TradeEntry = { ...nextBase, status, pnl };
  trades[idx] = next;
  await saveTrades(email, trades);
  return next;
}

export async function deleteTrade(
  email: string,
  id: string,
): Promise<boolean> {
  const trades = await getTrades(email);
  const next = trades.filter((t) => t.id !== id);
  if (next.length === trades.length) return false;
  await saveTrades(email, next);
  return true;
}
