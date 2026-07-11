"use client";

import {
  Archive,
  CheckSquare,
  FileEdit,
  Forward,
  Inbox,
  LogOut,
  Mail,
  MailOpen,
  MailWarning,
  MessagesSquare,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { WebmailShell } from "@/components/webmail-shell";
import { LacidawebAd } from "@/components/ads/lacidaweb-ad";
import type { MailFolder, MailListItem, MailMessage } from "@/lib/mail-types";
import type { UserSettings } from "@/lib/settings-types";
import { cn, formatRelativeDate } from "@/lib/utils";

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw|aw|sv|vs)\s*:\s*/gi, "")
    .replace(/^(re|fwd|fw|aw|sv|vs)\s*:\s*/gi, "")
    .trim()
    .toLowerCase() || "(no subject)";
}

function withSignature(body: string, signature: string): string {
  const sig = signature.trim();
  if (!sig) return body;
  if (body.includes(sig)) return body;
  return body ? `${body}\n\n--\n${sig}` : `--\n${sig}`;
}

type PaneMode = "empty" | "read" | "compose";
type ComposeMode = "new" | "reply" | "replyAll" | "forward";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL = 4 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const FOLDERS: {
  id: MailFolder;
  label: string;
  icon: typeof Inbox;
}[] = [
  { id: "INBOX", label: "Inbox", icon: Inbox },
  { id: "Sent", label: "Sent", icon: Send },
  { id: "Drafts", label: "Drafts", icon: FileEdit },
  { id: "Junk", label: "Junk", icon: ShieldAlert },
  { id: "Trash", label: "Trash", icon: Trash2 },
  { id: "Archive", label: "Archive", icon: Archive },
];

interface MailDashboardProps {
  email: string;
}

export function MailDashboard({ email }: MailDashboardProps) {
  const router = useRouter();
  const [folder, setFolder] = useState<MailFolder>("INBOX");
  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [mode, setMode] = useState<PaneMode>("empty");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [compose, setCompose] = useState({
    to: "",
    cc: "",
    subject: "",
    body: "",
  });
  const [composeMode, setComposeMode] = useState<ComposeMode>("new");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [checkedUids, setCheckedUids] = useState<number[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    displayName: "",
    signature: "",
    replyBehavior: "reply",
    threadedView: true,
  });
  const [expandedThreads, setExpandedThreads] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.settings) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  const loadMessages = useCallback(
    async (opts?: { folder?: MailFolder; search?: string }) => {
      const f = opts?.folder ?? folder;
      const q = opts?.search ?? search;
      setLoadingList(true);
      setListError(null);
      try {
        const params = new URLSearchParams({
          folder: f,
          limit: "20",
        });
        if (q.trim()) params.set("search", q.trim());

        const res = await fetch(`/api/mail/fetch?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          setListError(data.error || "Failed to load messages");
          setMessages([]);
          return;
        }
        setMessages(data.messages || []);
      } catch {
        setListError("Network error loading mail");
        setMessages([]);
      } finally {
        setLoadingList(false);
      }
    },
    [folder, search],
  );

  useEffect(() => {
    void loadMessages({ folder, search: "" });
    setSelectedUid(null);
    setSelected(null);
    setCheckedUids([]);
    setMode("empty");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const visibleMessages = useMemo(() => {
    if (filter === "unread") return messages.filter((m) => !m.seen);
    return messages;
  }, [messages, filter]);

  const threadedGroups = useMemo(() => {
    if (!settings.threadedView) return null;
    const map = new Map<string, MailListItem[]>();
    for (const msg of visibleMessages) {
      const key = normalizeSubject(msg.subject);
      const list = map.get(key) || [];
      list.push(msg);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      items,
      latest: items[0],
      unread: items.filter((m) => !m.seen).length,
    }));
  }, [visibleMessages, settings.threadedView]);

  async function openMessage(item: MailListItem) {
    // Drafts open in the composer so they can be edited/sent
    if (folder === "Drafts") {
      setLoadingMessage(true);
      try {
        const res = await fetch(
          `/api/mail/${item.uid}?folder=${encodeURIComponent(folder)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok) {
          setToast({ type: "error", message: data.error || "Failed to open draft" });
          return;
        }
        const draft = data.message as MailMessage;
        setMode("compose");
        setSelectedUid(null);
        setSelected(null);
        setAttachments([]);
        setCompose({
          to: draft.toEmail || draft.to || "",
          cc: draft.cc || "",
          subject: draft.subject === "(no subject)" ? "" : draft.subject,
          body: draft.text || "",
        });
        setComposeMode("new");
      } finally {
        setLoadingMessage(false);
      }
      return;
    }

    setMode("read");
    setSelectedUid(item.uid);
    setLoadingMessage(true);
    setSendOk(false);
    try {
      const res = await fetch(
        `/api/mail/${item.uid}?folder=${encodeURIComponent(folder)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        setSelected(null);
        return;
      }
      setSelected(data.message);
      setMessages((prev) =>
        prev.map((m) => (m.uid === item.uid ? { ...m, seen: true } : m)),
      );
    } finally {
      setLoadingMessage(false);
    }
  }

  function toggleChecked(uid: number) {
    setCheckedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  }

  function toggleSelectAll() {
    if (checkedUids.length === visibleMessages.length) {
      setCheckedUids([]);
    } else {
      setCheckedUids(visibleMessages.map((m) => m.uid));
    }
  }

  async function runBulkAction(
    action: "read" | "unread" | "trash" | "delete" | "junk" | "archive",
  ) {
    if (checkedUids.length === 0) return;
    try {
      const res = await fetch("/api/mail/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder,
          uids: checkedUids,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: data.error || "Action failed" });
        return;
      }
      setCheckedUids([]);
      setSelectedUid(null);
      setSelected(null);
      setMode("empty");
      const labels: Record<string, string> = {
        trash: "Moved to Trash.",
        delete: "Deleted permanently.",
        read: "Marked as read.",
        unread: "Marked as unread.",
        junk: folder === "Junk" ? "Moved to Inbox." : "Moved to Junk.",
        archive: "Archived.",
      };
      setToast({ type: "success", message: labels[action] || "Done." });
      void loadMessages();
    } catch {
      setToast({ type: "error", message: "Network error" });
    }
  }

  async function actOnSelected(
    action: "trash" | "delete" | "junk" | "archive" | "read" | "unread",
  ) {
    if (!selectedUid) return;
    try {
      const res = await fetch("/api/mail/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder,
          uids: [selectedUid],
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: data.error || "Action failed" });
        return;
      }

      if (action === "read" || action === "unread") {
        const seen = action === "read";
        setSelected((prev) => (prev ? { ...prev, seen } : prev));
        setMessages((prev) =>
          prev.map((m) => (m.uid === selectedUid ? { ...m, seen } : m)),
        );
        setToast({
          type: "success",
          message: seen ? "Marked as read." : "Marked as unread.",
        });
        return;
      }

      setSelectedUid(null);
      setSelected(null);
      setMode("empty");
      setToast({
        type: "success",
        message:
          action === "archive"
            ? "Archived."
            : action === "junk"
              ? "Moved to Junk."
              : action === "delete"
                ? "Deleted."
                : "Moved to Trash.",
      });
      void loadMessages();
    } catch {
      setToast({ type: "error", message: "Network error" });
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      const res = await fetch("/api/mail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: compose.to,
          subject: compose.subject,
          body: compose.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: data.error || "Failed to save draft" });
        return;
      }
      setToast({ type: "success", message: "Draft saved." });
      setFolder("Drafts");
      setMode("empty");
      setCompose({ to: "", cc: "", subject: "", body: "" });
      setAttachments([]);
      setComposeMode("new");
    } catch {
      setToast({ type: "error", message: "Network error saving draft" });
    } finally {
      setSavingDraft(false);
    }
  }

  function startCompose(
    source?: MailMessage,
    composeKind: ComposeMode = "new",
  ) {
    setMode("compose");
    setSelectedUid(null);
    setSelected(null);
    setSendError(null);
    setSendOk(false);
    setAttachments([]);

    let resolved: ComposeMode = composeKind;
    if (source && composeKind === "reply" && settings.replyBehavior === "replyAll") {
      resolved = "replyAll";
    }
    setComposeMode(resolved);

    const sig = settings.signature;

    if (!source || resolved === "new") {
      setCompose({
        to: "",
        cc: "",
        subject: "",
        body: withSignature("", sig),
      });
      return;
    }

    const quoted = `\n\n---\nOn ${new Date(source.date).toLocaleString()}, ${source.from} wrote:\n${source.text || ""}`;

    if (resolved === "reply") {
      setCompose({
        to: source.fromEmail || "",
        cc: "",
        subject: source.subject.startsWith("Re:")
          ? source.subject
          : `Re: ${source.subject}`,
        body: withSignature(quoted, sig),
      });
      return;
    }

    if (resolved === "replyAll") {
      const others = [source.toEmail, source.cc]
        .filter(Boolean)
        .filter((addr) => addr && addr.toLowerCase() !== email.toLowerCase())
        .join(", ");
      setCompose({
        to: source.fromEmail || "",
        cc: others,
        subject: source.subject.startsWith("Re:")
          ? source.subject
          : `Re: ${source.subject}`,
        body: withSignature(quoted, sig),
      });
      return;
    }

    setCompose({
      to: "",
      cc: "",
      subject: source.subject.startsWith("Fwd:")
        ? source.subject
        : `Fwd: ${source.subject}`,
      body: withSignature(
        `\n\n---------- Forwarded message ----------\nFrom: ${source.from} <${source.fromEmail}>\nDate: ${new Date(source.date).toLocaleString()}\nSubject: ${source.subject}\nTo: ${source.to}\n\n${source.text || ""}`,
        sig,
      ),
    });
  }

  function addAttachments(fileList: FileList | null) {
    if (!fileList?.length) return;
    setAttachments((prev) => {
      const next = [...prev];
      let total = next.reduce((sum, f) => sum + f.size, 0);
      for (const file of Array.from(fileList)) {
        if (next.length >= MAX_ATTACHMENTS) {
          setToast({
            type: "error",
            message: `Maximum ${MAX_ATTACHMENTS} attachments.`,
          });
          break;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setToast({
            type: "error",
            message: `"${file.name}" is over 3 MB.`,
          });
          continue;
        }
        if (total + file.size > MAX_ATTACHMENT_TOTAL) {
          setToast({
            type: "error",
            message: "Attachments exceed the 4 MB total limit.",
          });
          break;
        }
        next.push(file);
        total += file.size;
      }
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    setSending(true);
    setSendError(null);
    setSendOk(false);
    try {
      const form = new FormData();
      form.set("to", compose.to);
      form.set("cc", compose.cc);
      form.set("subject", compose.subject);
      form.set("body", compose.body);
      for (const file of attachments) {
        form.append("attachments", file, file.name);
      }

      const res = await fetch("/api/mail/send", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error || "Failed to send";
        setSendError(err);
        setToast({ type: "error", message: err });
        return;
      }

      const to = compose.to;
      const count = attachments.length;
      setSendOk(true);
      setCompose({ to: "", cc: "", subject: "", body: "" });
      setAttachments([]);
      setComposeMode("new");

      const attachNote =
        count > 0 ? ` with ${count} attachment${count === 1 ? "" : "s"}` : "";

      if (data.savedToSent) {
        setToast({
          type: "success",
          message: `Message sent to ${to}${attachNote} and saved in Sent.`,
        });
        setFolder("Sent");
        setMode("empty");
        void loadMessages({ folder: "Sent", search: "" });
      } else {
        setToast({
          type: "success",
          message: `Message sent to ${to}${attachNote}.${data.sentWarning ? ` (${data.sentWarning})` : ""}`,
        });
        setMode("empty");
      }
    } catch {
      const err = "Network error while sending";
      setSendError(err);
      setToast({ type: "error", message: err });
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(() => {
      void loadMessages({ search });
    });
  }

  const unreadCount = messages.filter((m) => !m.seen).length;

  function renderMessageRow(msg: MailListItem, opts?: { nested?: boolean }) {
    const active = selectedUid === msg.uid && mode === "read";
    const checked = checkedUids.includes(msg.uid);
    const primary =
      folder === "Sent" || folder === "Drafts"
        ? msg.toEmail || msg.to || msg.from
        : msg.from;
    return (
      <div
        key={msg.uid}
        className={cn(
          "flex w-full items-start gap-2 border-b border-[var(--border)] px-3 py-3.5 transition-colors",
          opts?.nested && "bg-[var(--surface-muted)]/40 pl-8",
          active
            ? "bg-[var(--accent-soft)]"
            : "hover:bg-[var(--surface-muted)]",
          !msg.seen && "bg-[var(--unread-bg)]",
          checked && "bg-[var(--accent-soft)]",
        )}
      >
        <button
          type="button"
          className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--muted-strong)] hover:text-[var(--foreground)]"
          onClick={(e) => {
            e.stopPropagation();
            toggleChecked(msg.uid);
          }}
          aria-label={checked ? "Deselect message" : "Select message"}
        >
          {checked ? (
            <CheckSquare className="h-4 w-4 text-[var(--accent)]" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void openMessage(msg)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-sm",
                !msg.seen
                  ? "font-semibold text-[var(--foreground)]"
                  : "font-medium text-[var(--muted-strong)]",
              )}
            >
              {folder === "Sent" || folder === "Drafts"
                ? `To: ${primary}`
                : primary}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--muted)]">
              {formatRelativeDate(msg.date)}
            </span>
          </div>
          <p
            className={cn(
              "mb-0.5 truncate text-sm",
              !msg.seen
                ? "font-medium text-[var(--foreground)]"
                : "text-[var(--muted-strong)]",
            )}
          >
            {!msg.seen && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] align-middle" />
            )}
            {msg.subject}
          </p>
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
            {msg.snippet || "—"}
          </p>
        </button>
      </div>
    );
  }

  return (
    <WebmailShell
      email={email}
      active="mail"
      sidebarCta={
        <button
          type="button"
          onClick={() => startCompose()}
          className="btn-primary mb-4 w-full gap-2"
        >
          <PenSquare className="h-4 w-4" />
          New Message
        </button>
      }
      sidebarExtra={
        <nav className="mb-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto border-t border-[var(--border)] pt-3">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Folders
          </p>
          {FOLDERS.map(({ id, label, icon: Icon }) => {
            const isActive = folder === id && mode !== "compose";
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFolder(id)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                    : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span className="flex-1 text-left">{label}</span>
                {id === "INBOX" && unreadCount > 0 && (
                  <span className="rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      }
    >
      {toast && (
        <div
          className={cn(
            "mail-toast",
            toast.type === "success" ? "mail-toast-success" : "mail-toast-error",
          )}
          role="status"
        >
          <span>{toast.message}</span>
          <button
            type="button"
            className="mail-toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Middle feed */}
      <section className="mail-feed">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
              {FOLDERS.find((f) => f.id === folder)?.label}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void loadMessages()}
                className="icon-btn"
                title="Refresh"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loadingList && "animate-spin")}
                />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="btn-secondary gap-1.5 px-2.5 py-1.5 text-xs"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
                Log out
              </button>
            </div>
          </div>

          <form onSubmit={onSearchSubmit} className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </form>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    filter === f
                      ? "bg-[var(--foreground)] text-white"
                      : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
                  )}
                >
                  {f}
                </button>
              ))}
              {settings.threadedView && (
                <span
                  className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--muted)]"
                  title="Threaded conversations on"
                >
                  <MessagesSquare className="h-3 w-3" />
                  Threads
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)]"
              disabled={visibleMessages.length === 0}
            >
              {checkedUids.length > 0 &&
              checkedUids.length === visibleMessages.length ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Select all
            </button>
          </div>

          {checkedUids.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2">
              <span className="text-xs font-medium text-[var(--muted-strong)]">
                {checkedUids.length} selected
              </span>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => void runBulkAction("read")}
              >
                Mark read
              </button>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => void runBulkAction("unread")}
              >
                Mark unread
              </button>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => void runBulkAction("junk")}
              >
                {folder === "Junk" ? "Not junk" : "Junk"}
              </button>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => void runBulkAction("archive")}
              >
                Archive
              </button>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs text-red-700 hover:border-red-200 hover:bg-red-50"
                onClick={() =>
                  void runBulkAction(folder === "Trash" ? "delete" : "trash")
                }
              >
                <Trash2 className="mr-1 inline h-3 w-3" />
                {folder === "Trash" ? "Delete" : "Trash"}
              </button>
              <button
                type="button"
                className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                onClick={() => setCheckedUids([])}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <div className="space-y-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse border-b border-[var(--border)] px-4 py-4"
                >
                  <div className="mb-2 h-3 w-1/3 rounded bg-[var(--surface-muted)]" />
                  <div className="mb-2 h-3 w-2/3 rounded bg-[var(--surface-muted)]" />
                  <div className="h-3 w-full rounded bg-[var(--surface-muted)]" />
                </div>
              ))}
            </div>
          )}

          {!loadingList && listError && (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {listError}
            </div>
          )}

          {!loadingList && !listError && visibleMessages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <Inbox className="h-8 w-8 text-[var(--muted)] opacity-50" />
              <p className="text-sm font-medium text-[var(--muted-strong)]">
                No messages
              </p>
              <p className="text-xs text-[var(--muted)]">
                {filter === "unread"
                  ? "You’re all caught up."
                  : "This folder is empty."}
              </p>
            </div>
          )}

          {!loadingList &&
            !listError &&
            threadedGroups &&
            threadedGroups.map((thread) => {
              if (thread.items.length === 1) {
                return renderMessageRow(thread.latest);
              }
              const expanded = expandedThreads.includes(thread.key);
              return (
                <div key={thread.key}>
                  <div className="relative">
                    {renderMessageRow(thread.latest)}
                    <button
                      type="button"
                      className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] shadow-sm ring-1 ring-[var(--border)]"
                      onClick={() =>
                        setExpandedThreads((prev) =>
                          prev.includes(thread.key)
                            ? prev.filter((k) => k !== thread.key)
                            : [...prev, thread.key],
                        )
                      }
                    >
                      <MessagesSquare className="h-3 w-3" />
                      {thread.items.length}
                      {thread.unread > 0 ? ` · ${thread.unread} new` : ""}
                    </button>
                  </div>
                  {expanded &&
                    thread.items
                      .slice(1)
                      .map((msg) => renderMessageRow(msg, { nested: true }))}
                </div>
              );
            })}

          {!loadingList &&
            !listError &&
            !threadedGroups &&
            visibleMessages.map((msg) => renderMessageRow(msg))}
        </div>
      </section>

      {/* Right pane */}
      <section className="mail-reader">
        {mode === "empty" && (
          <div className="flex h-full flex-col">
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-muted)]">
                <Mail className="h-6 w-6 text-[var(--muted)]" />
              </div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
                Select a message
              </p>
              <p className="max-w-xs text-sm text-[var(--muted)]">
                Choose an email from the list, or compose a new message to get
                started.
              </p>
            </div>
            <LacidawebAd className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-3" />
          </div>
        )}

        {mode === "read" && (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {loadingMessage && (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
                Loading message…
              </div>
            )}
            {!loadingMessage && selected && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startCompose(selected, "reply")}
                      className="btn-secondary gap-1.5 text-xs"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => startCompose(selected, "replyAll")}
                      className="btn-secondary gap-1.5 text-xs"
                    >
                      <ReplyAll className="h-3.5 w-3.5" />
                      Reply all
                    </button>
                    <button
                      type="button"
                      onClick={() => startCompose(selected, "forward")}
                      className="btn-secondary gap-1.5 text-xs"
                    >
                      <Forward className="h-3.5 w-3.5" />
                      Forward
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void actOnSelected(selected.seen ? "unread" : "read")
                      }
                      className="btn-secondary gap-1.5 text-xs"
                    >
                      {selected.seen ? (
                        <>
                          <MailWarning className="h-3.5 w-3.5" />
                          Mark unread
                        </>
                      ) : (
                        <>
                          <MailOpen className="h-3.5 w-3.5" />
                          Mark as read
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void actOnSelected("archive")}
                      className="btn-secondary gap-1.5 text-xs"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => void actOnSelected("junk")}
                      className="btn-secondary gap-1.5 text-xs"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Junk
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void actOnSelected(
                          folder === "Trash" ? "delete" : "trash",
                        )
                      }
                      className="btn-secondary gap-1.5 text-xs text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {folder === "Trash" ? "Delete" : "Trash"}
                    </button>
                  </div>
                  <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--foreground)]">
                    {selected.subject}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{selected.from}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {selected.fromEmail}
                        {selected.to ? ` → ${selected.to}` : ""}
                        {selected.cc ? ` · Cc ${selected.cc}` : ""}
                      </p>
                    </div>
                    <time className="text-xs text-[var(--muted)]">
                      {new Date(selected.date).toLocaleString()}
                    </time>
                  </div>
                </header>

                <LacidawebAd className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-3" />

                <div className="mail-body-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
                  {selected.html ? (
                    <div
                      className="prose-mail"
                      dangerouslySetInnerHTML={{ __html: selected.html }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--foreground)]">
                      {selected.text || "(empty message)"}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "compose" && (
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
              <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
                {composeMode === "reply"
                  ? "Reply"
                  : composeMode === "replyAll"
                    ? "Reply all"
                    : composeMode === "forward"
                      ? "Forward"
                      : "New message"}
              </h1>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn-secondary gap-2 text-sm"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={
                    savingDraft ||
                    (!compose.to.trim() &&
                      !compose.subject.trim() &&
                      !compose.body.trim())
                  }
                  className="btn-secondary text-sm"
                >
                  {savingDraft ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("empty")}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    sending ||
                    !compose.to.trim() ||
                    !compose.subject.trim() ||
                    !compose.body.trim()
                  }
                  onClick={() => void handleSend()}
                  className="btn-primary gap-2"
                >
                  <Send className="h-4 w-4" />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <label className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-6 py-3">
                <span className="w-14 shrink-0 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  To
                </span>
                <input
                  value={compose.to}
                  onChange={(e) =>
                    setCompose((c) => ({ ...c, to: e.target.value }))
                  }
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="recipient@example.com"
                  type="text"
                />
              </label>
              <label className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-6 py-3">
                <span className="w-14 shrink-0 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Cc
                </span>
                <input
                  value={compose.cc}
                  onChange={(e) =>
                    setCompose((c) => ({ ...c, cc: e.target.value }))
                  }
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="optional"
                  type="text"
                />
              </label>
              <label className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-6 py-3">
                <span className="w-14 shrink-0 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Subject
                </span>
                <input
                  value={compose.subject}
                  onChange={(e) =>
                    setCompose((c) => ({ ...c, subject: e.target.value }))
                  }
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="What’s this about?"
                />
              </label>
              <textarea
                value={compose.body}
                onChange={(e) =>
                  setCompose((c) => ({ ...c, body: e.target.value }))
                }
                className="min-h-0 flex-1 resize-none bg-transparent px-6 py-4 text-sm leading-relaxed outline-none"
                placeholder="Write your message…"
              />

              {attachments.length > 0 && (
                <div className="shrink-0 border-t border-[var(--border)] px-6 py-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Attachments ({attachments.length})
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {attachments.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                        <span className="truncate font-medium">{file.name}</span>
                        <span className="shrink-0 text-[var(--muted)]">
                          {formatBytes(file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="rounded p-0.5 text-[var(--muted)] hover:bg-white hover:text-red-600"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addAttachments(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary gap-2 text-sm"
                  disabled={sending || attachments.length >= MAX_ATTACHMENTS}
                >
                  <Paperclip className="h-4 w-4" />
                  Attach
                </button>
                <div className="min-w-0 text-sm">
                  {sendError && <p className="text-red-600">{sendError}</p>}
                  {sendOk && <p className="text-emerald-600">Message sent.</p>}
                  {!sendError && !sendOk && (
                    <p className="text-xs text-[var(--muted)]">
                      Up to {MAX_ATTACHMENTS} files, 3 MB each
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={
                  sending ||
                  !compose.to.trim() ||
                  !compose.subject.trim() ||
                  !compose.body.trim()
                }
                onClick={() => void handleSend()}
                className="btn-primary gap-2"
              >
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : "Send"}
              </button>
            </footer>
          </div>
        )}
      </section>
    </WebmailShell>
  );
}
