function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Comma-separated admin mailbox addresses. Case-insensitive. */
export function getAdminEmails(): string[] {
  return optional("ADMIN_EMAILS")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}
