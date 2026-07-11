"use client";

import { CandlestickChart, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WebmailShell } from "@/components/webmail-shell";
import { cn } from "@/lib/utils";

interface Trade {
  id: string;
  date: string;
  symbol: string;
  side: "long" | "short";
  status: "open" | "closed";
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  fees: number;
  pnl: number | null;
  setup: string;
  notes: string;
}

interface Stats {
  count: number;
  open: number;
  closed: number;
  totalPnl: number;
  winRate: number | null;
}

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  symbol: "",
  side: "long" as "long" | "short",
  entryPrice: "",
  exitPrice: "",
  quantity: "",
  fees: "",
  setup: "",
  notes: "",
};

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

export function TradingJournalPage({ email }: { email: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trades", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load journal");
        setTrades([]);
        setStats(null);
        return;
      }
      setTrades(data.trades || []);
      setStats(data.stats || null);
    } catch {
      setError("Network error loading journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const entryPrice = Number(form.entryPrice);
      const quantity = Number(form.quantity);
      const fees = form.fees ? Number(form.fees) : 0;
      const exitPrice = form.exitPrice ? Number(form.exitPrice) : null;

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          symbol: form.symbol,
          side: form.side,
          entryPrice,
          exitPrice,
          quantity,
          fees,
          setup: form.setup,
          notes: form.notes,
          status: exitPrice != null ? "closed" : "open",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save trade");
        return;
      }
      setForm({ ...emptyForm, date: form.date });
      await load();
    } catch {
      setError("Network error saving trade");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this trade?")) return;
    try {
      const res = await fetch(`/api/trades?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
        return;
      }
      await load();
    } catch {
      setError("Network error deleting trade");
    }
  }

  return (
    <WebmailShell email={email} active="trades">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <CandlestickChart className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                Trading Journal
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Log setups, size, and P&amp;L for every trade
              </p>
            </div>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 space-y-6 p-6">
          {stats && (
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Trades", value: String(stats.count) },
                { label: "Open", value: String(stats.open) },
                {
                  label: "Win rate",
                  value:
                    stats.winRate == null ? "—" : `${stats.winRate}%`,
                },
                {
                  label: "Net P&L",
                  value: money(stats.totalPnl),
                  tone:
                    stats.totalPnl > 0
                      ? "text-emerald-600"
                      : stats.totalPnl < 0
                        ? "text-red-600"
                        : "",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                >
                  <p className="text-xs text-[var(--muted)]">{card.label}</p>
                  <p
                    className={cn(
                      "mt-1 text-lg font-semibold tabular-nums",
                      card.tone,
                    )}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleCreate}
            className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <p className="text-sm font-medium sm:col-span-2 lg:col-span-4">
              Log trade
            </p>
            <div>
              <label className="field-label">Date</label>
              <input
                type="date"
                className="field-input mt-1.5"
                required
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Symbol</label>
              <input
                className="field-input mt-1.5"
                placeholder="EURUSD / AAPL / BTC"
                required
                value={form.symbol}
                onChange={(e) =>
                  setForm((f) => ({ ...f, symbol: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Side</label>
              <select
                className="field-input mt-1.5"
                value={form.side}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    side: e.target.value as "long" | "short",
                  }))
                }
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div>
              <label className="field-label">Quantity</label>
              <input
                type="number"
                step="any"
                min="0"
                className="field-input mt-1.5"
                required
                value={form.quantity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantity: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Entry</label>
              <input
                type="number"
                step="any"
                className="field-input mt-1.5"
                required
                value={form.entryPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, entryPrice: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Exit (optional)</label>
              <input
                type="number"
                step="any"
                className="field-input mt-1.5"
                value={form.exitPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, exitPrice: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Fees</label>
              <input
                type="number"
                step="any"
                min="0"
                className="field-input mt-1.5"
                value={form.fees}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fees: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Setup / tag</label>
              <input
                className="field-input mt-1.5"
                placeholder="Breakout, news…"
                value={form.setup}
                onChange={(e) =>
                  setForm((f) => ({ ...f, setup: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="field-label">Notes</label>
              <textarea
                className="field-input mt-1.5 min-h-[80px] resize-y"
                placeholder="What worked, what to improve…"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary gap-2 sm:col-span-2 sm:w-fit lg:col-span-4"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Saving…" : "Add trade"}
            </button>
          </form>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading journal…</p>
          ) : trades.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No trades logged yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {trades.map((trade) => (
                <li
                  key={trade.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{trade.symbol}</p>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-medium uppercase",
                          trade.side === "long"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-red-500/15 text-red-700",
                        )}
                      >
                        {trade.side}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {trade.status} · {trade.date}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted-strong)]">
                      Entry {trade.entryPrice}
                      {trade.exitPrice != null
                        ? ` → Exit ${trade.exitPrice}`
                        : ""}{" "}
                      · Qty {trade.quantity}
                      {trade.fees ? ` · Fees ${trade.fees}` : ""}
                      {trade.setup ? ` · ${trade.setup}` : ""}
                    </p>
                    {trade.notes && (
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {trade.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        (trade.pnl || 0) > 0 && "text-emerald-600",
                        (trade.pnl || 0) < 0 && "text-red-600",
                      )}
                    >
                      {money(trade.pnl)}
                    </p>
                    <button
                      type="button"
                      className="icon-btn text-red-600"
                      onClick={() => void handleDelete(trade.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </WebmailShell>
  );
}
