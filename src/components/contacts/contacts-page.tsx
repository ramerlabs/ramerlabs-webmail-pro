"use client";

import { Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WebmailShell } from "@/components/webmail-shell";

interface Contact {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  org: string;
  description: string;
}

export function ContactsPage({ email }: { email: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    org: "",
    description: "",
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load contacts");
        setContacts([]);
        return;
      }
      setContacts(data.contacts || []);
    } catch {
      setError("Network error loading contacts");
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
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create contact");
        return;
      }
      setForm({ fullName: "", email: "", phone: "", org: "", description: "" });
      await load();
    } catch {
      setError("Network error creating contact");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this contact?")) return;
    try {
      const res = await fetch(`/api/contacts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
        return;
      }
      await load();
    } catch {
      setError("Network error deleting contact");
    }
  }

  return (
    <WebmailShell email={email} active="contacts">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                Contacts
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Personal address book synced to your account
              </p>
            </div>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 p-6">
          <form
            onSubmit={handleCreate}
            className="mb-8 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2"
          >
            <p className="sm:col-span-2 text-sm font-medium">Add contact</p>
            <input
              className="field-input"
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) =>
                setForm((f) => ({ ...f, fullName: e.target.value }))
              }
              required
            />
            <input
              className="field-input"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
            <input
              className="field-input"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
            <input
              className="field-input"
              placeholder="Organization"
              value={form.org}
              onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
            />
            <textarea
              className="field-input sm:col-span-2 min-h-24 resize-y"
              placeholder="Description / notes — role, how you met, anything useful…"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              maxLength={4000}
            />
            <button
              type="submit"
              disabled={saving}
              className="btn-primary gap-2 sm:col-span-2 sm:w-fit"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Saving…" : "Add contact"}
            </button>
          </form>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading contacts…</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No contacts yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{c.fullName}</p>
                    <p className="truncate text-sm text-[var(--muted)]">
                      {[c.email, c.phone, c.org].filter(Boolean).join(" · ") ||
                        "No details"}
                    </p>
                    {c.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted-strong)]">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-btn text-red-600"
                    onClick={() => void handleDelete(c.id)}
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
