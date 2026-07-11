"use client";

import { Plus, StickyNote, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WebmailShell } from "@/components/webmail-shell";
import { cn } from "@/lib/utils";

interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export function NotesPage({ email }: { email: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load notes");
        setNotes([]);
        return;
      }
      const list: Note[] = data.notes || [];
      setNotes(list);
      setSelectedId((prev) => {
        if (prev && list.some((n) => n.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      setError("Network error loading notes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setForm({ title: "", body: "" });
      setDirty(false);
      return;
    }
    const note = notes.find((n) => n.id === selectedId);
    if (!note) return;
    setForm({ title: note.title, body: note.body });
    setDirty(false);
  }, [selectedId, notes]);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled", body: "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create note");
        return;
      }
      await load();
      if (data.note?.id) setSelectedId(data.note.id);
    } catch {
      setError("Network error creating note");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId,
          title: form.title,
          body: form.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save note");
        return;
      }
      setDirty(false);
      await load();
    } catch {
      setError("Network error saving note");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this note?")) return;
    try {
      const res = await fetch(`/api/notes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
        return;
      }
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch {
      setError("Network error deleting note");
    }
  }

  function preview(body: string) {
    const line = body.replace(/\s+/g, " ").trim();
    if (!line) return "Empty note";
    return line.length > 80 ? `${line.slice(0, 80)}…` : line;
  }

  return (
    <WebmailShell email={email} active="notes">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StickyNote className="h-5 w-5 text-[var(--accent)]" />
              <div>
                <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                  Notes
                </h1>
                <p className="text-sm text-[var(--muted)]">
                  Private notes synced to your account
                  {notes.length ? ` · ${notes.length}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary gap-2 text-sm"
              onClick={() => void handleCreate()}
              disabled={saving}
            >
              <Plus className="h-4 w-4" />
              New note
            </button>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading notes…</p>
          ) : notes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
              <p className="text-sm text-[var(--muted)]">No notes yet.</p>
              <button
                type="button"
                className="btn-primary mt-4 gap-2"
                onClick={() => void handleCreate()}
                disabled={saving}
              >
                <Plus className="h-4 w-4" />
                Create your first note
              </button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {notes.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(note.id)}
                      className={cn(
                        "w-full px-3 py-3 text-left transition-colors",
                        selectedId === note.id
                          ? "bg-[var(--accent-soft)]"
                          : "hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      <p className="truncate text-sm font-medium">
                        {note.title || "Untitled"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {preview(note.body)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              {selectedId && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-[var(--muted)]">
                      {dirty ? "Unsaved changes" : "Saved"}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        disabled={saving || !dirty}
                        onClick={() => void handleSave()}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="icon-btn text-red-600"
                        onClick={() => void handleDelete(selectedId)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <input
                    className="field-input mb-3 font-medium"
                    placeholder="Title"
                    value={form.title}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, title: e.target.value }));
                      setDirty(true);
                    }}
                    maxLength={200}
                  />
                  <textarea
                    className="field-input min-h-[280px] resize-y font-[family-name:var(--font-body)] leading-relaxed"
                    placeholder="Write your note…"
                    value={form.body}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, body: e.target.value }));
                      setDirty(true);
                    }}
                    maxLength={20000}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </WebmailShell>
  );
}
