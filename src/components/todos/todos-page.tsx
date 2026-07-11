"use client";

import { CheckSquare, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WebmailShell } from "@/components/webmail-shell";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function priorityClass(priority: Priority): string {
  if (priority === "high") return "bg-red-500/15 text-red-700";
  if (priority === "low") return "bg-[var(--surface-muted)] text-[var(--muted)]";
  return "bg-amber-500/15 text-amber-800";
}

export function TodosPage({ email }: { email: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load todos");
        setTodos([]);
        return;
      }
      const list: Todo[] = (data.todos || []).map(
        (t: Todo & { priority?: Priority }) => ({
          ...t,
          priority: t.priority || "medium",
        }),
      );
      setTodos(list);
      setSelected((prev) => {
        const ids = new Set(list.map((t) => t.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } catch {
      setError("Network error loading todos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected =
    todos.length > 0 && todos.every((t) => selected.has(t.id));
  const selectedCount = selected.size;

  const openCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(todos.map((t) => t.id)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), priority }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create todo");
        return;
      }
      setTitle("");
      setPriority("medium");
      await load();
    } catch {
      setError("Network error creating todo");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(todo: Todo) {
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, completed: !todo.completed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update todo");
        return;
      }
      await load();
    } catch {
      setError("Network error updating todo");
    }
  }

  async function handlePriorityChange(todo: Todo, next: Priority) {
    if (todo.priority === next) return;
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, priority: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update priority");
        return;
      }
      await load();
    } catch {
      setError("Network error updating priority");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this todo?")) return;
    try {
      const res = await fetch(`/api/todos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete");
        return;
      }
      await load();
    } catch {
      setError("Network error deleting todo");
    }
  }

  async function handleMassDelete() {
    if (selectedCount === 0) return;
    if (
      !window.confirm(
        `Delete ${selectedCount} selected todo${selectedCount === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete selected");
        return;
      }
      setSelected(new Set());
      await load();
    } catch {
      setError("Network error deleting todos");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCompleted() {
    const completedIds = todos.filter((t) => t.completed).map((t) => t.id);
    if (!completedIds.length) return;
    if (
      !window.confirm(
        `Delete ${completedIds.length} completed todo${completedIds.length === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: completedIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete completed");
        return;
      }
      setSelected(new Set());
      await load();
    } catch {
      setError("Network error deleting completed todos");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WebmailShell email={email} active="todos">
      <section className="mail-reader mail-reader-full">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                To-do
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Personal checklist synced to your account
                {todos.length
                  ? ` · ${openCount} open of ${todos.length}`
                  : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="mail-body-scroll flex-1 p-6">
          <form
            onSubmit={handleCreate}
            className="mb-6 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
          >
            <input
              className="field-input"
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={500}
            />
            <select
              className="field-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              aria-label="Priority"
            >
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="btn-primary gap-2"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Adding…" : "Add"}
            </button>
          </form>

          {todos.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--muted-strong)]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Select all
                {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary gap-1.5 text-sm text-red-700"
                  disabled={saving || selectedCount === 0}
                  onClick={() => void handleMassDelete()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete selected
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={
                    saving || !todos.some((t) => t.completed)
                  }
                  onClick={() => void handleDeleteCompleted()}
                >
                  Clear completed
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading todos…</p>
          ) : todos.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No todos yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(todo.id)}
                      onChange={() => toggleSelect(todo.id)}
                      className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      aria-label={`Select ${todo.title}`}
                    />
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => void handleToggle(todo)}
                        className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-sm leading-relaxed",
                            todo.completed &&
                              "text-[var(--muted)] line-through",
                          )}
                        >
                          {todo.title}
                        </span>
                        <span
                          className={cn(
                            "mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium",
                            priorityClass(todo.priority),
                          )}
                        >
                          {PRIORITY_LABEL[todo.priority]}
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="field-input h-8 w-[7.5rem] py-1 text-xs"
                      value={todo.priority}
                      onChange={(e) =>
                        void handlePriorityChange(
                          todo,
                          e.target.value as Priority,
                        )
                      }
                      aria-label="Change priority"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <button
                      type="button"
                      className="icon-btn text-red-600"
                      onClick={() => void handleDelete(todo.id)}
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
