"use client";

import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WebmailShell } from "@/components/webmail-shell";

interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
}

function formatEventWhen(ev: CalendarEvent): string {
  if (ev.allDay || /^\d{4}-\d{2}-\d{2}$/.test(ev.start)) {
    return `${ev.start}${ev.end && ev.end !== ev.start ? ` → ${ev.end}` : ""}`;
  }
  try {
    const start = new Date(ev.start).toLocaleString();
    if (!ev.end || ev.end === ev.start) return start;
    return `${start} → ${new Date(ev.end).toLocaleString()}`;
  } catch {
    return ev.start;
  }
}

export function CalendarPage({ email }: { email: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    summary: "",
    description: "",
    location: "",
    start: "",
    end: "",
    allDay: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load calendar");
        setEvents([]);
        return;
      }
      setEvents(data.events || []);
    } catch {
      setError("Network error loading calendar");
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
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create event");
        return;
      }
      setForm({
        summary: "",
        description: "",
        location: "",
        start: "",
        end: "",
        allDay: false,
      });
      await load();
    } catch {
      setError("Network error creating event");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this event?")) return;
    try {
      const res = await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
        return;
      }
      await load();
    } catch {
      setError("Network error deleting event");
    }
  }

  return (
    <WebmailShell email={email} active="calendar">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                Calendar
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Personal events synced to your account
              </p>
            </div>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 p-6">
          <form
            onSubmit={handleCreate}
            className="mb-8 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2"
          >
            <p className="sm:col-span-2 text-sm font-medium">New event</p>
            <input
              className="field-input sm:col-span-2"
              placeholder="Title"
              value={form.summary}
              onChange={(e) =>
                setForm((f) => ({ ...f, summary: e.target.value }))
              }
              required
            />
            <input
              className="field-input"
              type={form.allDay ? "date" : "datetime-local"}
              value={form.start}
              onChange={(e) =>
                setForm((f) => ({ ...f, start: e.target.value }))
              }
              required
            />
            <input
              className="field-input"
              type={form.allDay ? "date" : "datetime-local"}
              value={form.end}
              onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
              required
            />
            <input
              className="field-input"
              placeholder="Location"
              value={form.location}
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
            />
            <label className="flex items-center gap-2 text-sm text-[var(--muted-strong)]">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    allDay: e.target.checked,
                    start: "",
                    end: "",
                  }))
                }
              />
              All day
            </label>
            <textarea
              className="field-input sm:col-span-2 min-h-20"
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
            <button
              type="submit"
              disabled={saving}
              className="btn-primary gap-2 sm:col-span-2 sm:w-fit"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Saving…" : "Add event"}
            </button>
          </form>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading events…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No events yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{ev.summary}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {formatEventWhen(ev)}
                      {ev.location ? ` · ${ev.location}` : ""}
                      {ev.allDay ? " · All day" : ""}
                    </p>
                    {ev.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                        {ev.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-btn text-red-600"
                    onClick={() => void handleDelete(ev.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </WebmailShell>
  );
}
