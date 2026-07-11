import { getCpanelConfig } from "@/lib/env";

export interface AddMailboxResult {
  ok: boolean;
  email?: string;
  error?: string;
  raw?: unknown;
}

async function readCpanelResponse(res: Response): Promise<{
  json: {
    status?: number;
    errors?: string[] | null;
    messages?: string[] | null;
    data?: unknown;
  } | null;
  text: string;
}> {
  const text = (await res.text()).trim();
  if (!text) return { json: null, text: "" };

  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function friendlyCpanelError(status: number, text: string): string {
  const lower = text.toLowerCase();
  if (
    lower.includes("access denied") ||
    status === 401 ||
    status === 403
  ) {
    return (
      "cPanel access denied. Check CPANEL_USERNAME (cPanel account name, not an email), " +
      "CPANEL_API_TOKEN, and that the token can manage email accounts. " +
      "Also confirm CPANEL_HOST is reachable from Vercel (usually mail.yourdomain.com:2083)."
    );
  }
  if (status === 404) {
    return "cPanel API endpoint not found. Verify CPANEL_HOST and CPANEL_PORT (2083).";
  }
  return text.slice(0, 300) || `cPanel API error (HTTP ${status})`;
}

/**
 * Provisions a mailbox via cPanel UAPI Email::add_pop
 * https://api.docs.cpanel.net/openapi/cpanel/operation/email-add_pop/
 */
export async function addPopMailbox(
  username: string,
  password: string,
): Promise<AddMailboxResult> {
  let cfg;
  try {
    cfg = getCpanelConfig();
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "cPanel environment variables are not configured",
    };
  }

  if (
    !cfg.username ||
    cfg.username === "your_cpanel_username" ||
    cfg.apiToken === "your_cpanel_api_token"
  ) {
    return {
      ok: false,
      error:
        "cPanel is not configured. Set CPANEL_USERNAME to your cPanel account username and a valid CPANEL_API_TOKEN.",
    };
  }

  const localPart = username.trim().toLowerCase();
  const email = `${localPart}@${cfg.domain}`;

  const params = new URLSearchParams({
    email: localPart,
    password,
    quota: String(cfg.quotaMb),
    domain: cfg.domain,
  });

  // Prefer HTTPS UAPI execute endpoint
  const url = `https://${cfg.host}:${cfg.port}/execute/Email/add_pop?${params.toString()}`;
  const authHeader = `cpanel ${cfg.username}:${cfg.apiToken}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const { json, text } = await readCpanelResponse(res);

    if (!json) {
      return {
        ok: false,
        error: friendlyCpanelError(res.status, text || "Access denied"),
        raw: { status: res.status, body: text },
      };
    }

    if (!res.ok || json.status === 0) {
      const message =
        json.errors?.filter(Boolean).join(" ") ||
        json.messages?.filter(Boolean).join(" ") ||
        friendlyCpanelError(res.status, text);
      return { ok: false, error: message, raw: json };
    }

    return { ok: true, email, raw: json };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach cPanel API";

    if (
      message.includes("certificate") ||
      message.includes("SSL") ||
      message.includes("TLS")
    ) {
      return {
        ok: false,
        error:
          "Could not connect to cPanel over HTTPS (TLS). Use a valid hostname with a trusted certificate, or contact your host.",
      };
    }

    return { ok: false, error: message };
  }
}

/**
 * Change a mailbox password via cPanel UAPI Email::passwd_pop
 * https://api.docs.cpanel.net/openapi/cpanel/operation/email-passwd_pop/
 *
 * Uses POST + full email so special characters in passwords are not mangled
 * by query-string encoding. Callers should verify the new password (e.g. IMAP)
 * before telling the user it worked.
 */
export async function changeMailboxPassword(
  emailAddress: string,
  newPassword: string,
): Promise<AddMailboxResult> {
  let cfg;
  try {
    cfg = getCpanelConfig();
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "cPanel environment variables are not configured",
    };
  }

  const email = emailAddress.trim().toLowerCase();
  const [localPart, domainPart] = email.split("@");
  if (!localPart || !domainPart) {
    return { ok: false, error: "Invalid email address" };
  }

  const authHeader = `cpanel ${cfg.username}:${cfg.apiToken}`;
  const endpoint = `https://${cfg.host}:${cfg.port}/execute/Email/passwd_pop`;

  // Prefer full address (official cPanel examples). Fall back to local+domain.
  const attempts: URLSearchParams[] = [
    new URLSearchParams({ email, password: newPassword }),
    new URLSearchParams({
      email: localPart,
      domain: domainPart,
      password: newPassword,
    }),
  ];

  let lastError = "Failed to update password";
  let lastRaw: unknown;

  for (const body of attempts) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        cache: "no-store",
      });

      const { json, text } = await readCpanelResponse(res);
      lastRaw = json || { status: res.status, body: text };

      if (!json) {
        lastError = friendlyCpanelError(res.status, text || "Access denied");
        continue;
      }

      const status = Number(json.status);
      if (!res.ok || status !== 1) {
        lastError =
          json.errors?.filter(Boolean).join(" ") ||
          json.messages?.filter(Boolean).join(" ") ||
          friendlyCpanelError(res.status, text);
        continue;
      }

      return { ok: true, email, raw: json };
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : "Failed to reach cPanel API";
    }
  }

  return { ok: false, error: lastError, raw: lastRaw };
}

async function cpanelExecute(
  module: string,
  func: string,
  params: Record<string, string> = {},
): Promise<{
  ok: boolean;
  data?: unknown;
  error?: string;
  raw?: unknown;
}> {
  let cfg;
  try {
    cfg = getCpanelConfig();
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "cPanel environment variables are not configured",
    };
  }

  const qs = new URLSearchParams(params);
  const url = `https://${cfg.host}:${cfg.port}/execute/${module}/${func}${
    qs.toString() ? `?${qs.toString()}` : ""
  }`;
  const authHeader = `cpanel ${cfg.username}:${cfg.apiToken}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const { json, text } = await readCpanelResponse(res);
    if (!json) {
      return {
        ok: false,
        error: friendlyCpanelError(res.status, text || "Access denied"),
        raw: { status: res.status, body: text },
      };
    }
    if (!res.ok || json.status === 0) {
      const message =
        json.errors?.filter(Boolean).join(" ") ||
        json.messages?.filter(Boolean).join(" ") ||
        friendlyCpanelError(res.status, text);
      return { ok: false, error: message, raw: json };
    }
    return { ok: true, data: json.data, raw: json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reach cPanel API",
    };
  }
}

export interface AccountDiskUsage {
  usedBytes: number;
  limitBytes: number;
  percent: number;
  available: boolean;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Account-level disk usage from cPanel (hosting quota, not one mailbox).
 */
export async function fetchAccountDiskUsage(): Promise<
  AccountDiskUsage & { error?: string }
> {
  const unavailable = {
    usedBytes: 0,
    limitBytes: 0,
    percent: 0,
    available: false,
  };

  const quota = await cpanelExecute("Quota", "get_local_quota_info");
  if (quota.ok && quota.data && typeof quota.data === "object") {
    const d = quota.data as Record<string, unknown>;
    const used =
      toNumber(d.byte_used) ??
      toNumber(d.bytes_used) ??
      toNumber(d.diskused);
    const limit =
      toNumber(d.byte_limit) ??
      toNumber(d.bytes_limit) ??
      toNumber(d.disklimit);

    if (used == null) {
      const usedMb = toNumber(d.megabytes_used);
      const limitMb = toNumber(d.megabytes_limit);
      if (usedMb != null && limitMb != null && limitMb > 0) {
        const usedBytes = usedMb * 1024 * 1024;
        const limitBytes = limitMb * 1024 * 1024;
        return {
          usedBytes,
          limitBytes,
          percent: Math.min(100, Math.round((usedBytes / limitBytes) * 100)),
          available: true,
        };
      }
    }

    if (used != null && limit != null && limit > 0) {
      return {
        usedBytes: used,
        limitBytes: limit,
        percent: Math.min(100, Math.round((used / limit) * 100)),
        available: true,
      };
    }
  }

  const usages = await cpanelExecute("ResourceUsage", "get_usages");
  if (usages.ok && Array.isArray(usages.data)) {
    const disk = (usages.data as Record<string, unknown>[]).find((row) => {
      const id = String(row.id || row.module || "").toLowerCase();
      const desc = String(row.description || "").toLowerCase();
      return id.includes("disk") || desc.includes("disk");
    });
    if (disk) {
      const used = toNumber(disk.usage);
      const limit = toNumber(disk.maximum) ?? toNumber(disk.limit);
      if (used != null && limit != null && limit > 0) {
        const usedBytes = used * 1024 * 1024;
        const limitBytes = limit * 1024 * 1024;
        return {
          usedBytes,
          limitBytes,
          percent: Math.min(100, Math.round((usedBytes / limitBytes) * 100)),
          available: true,
        };
      }
    }
  }

  return {
    ...unavailable,
    error: quota.error || usages.error || "Account disk quota unavailable",
  };
}

export interface MailboxDiskRow {
  email: string;
  usedMb: number | null;
  quotaMb: number | null;
  percent: number | null;
}

/** List mailboxes with disk usage via Email::list_pops_with_disk */
export async function listMailboxesWithDisk(): Promise<{
  ok: boolean;
  mailboxes: MailboxDiskRow[];
  error?: string;
}> {
  const result = await cpanelExecute("Email", "list_pops_with_disk");
  if (!result.ok) {
    const plain = await cpanelExecute("Email", "list_pops");
    if (!plain.ok || !Array.isArray(plain.data)) {
      return {
        ok: false,
        mailboxes: [],
        error: result.error || plain.error || "Failed to list mailboxes",
      };
    }
    const mailboxes = (plain.data as Record<string, unknown>[])
      .map((row) => ({
        email: String(row.email || row.login || ""),
        usedMb: null,
        quotaMb: null,
        percent: null,
      }))
      .filter((m) => m.email);
    return { ok: true, mailboxes };
  }

  if (!Array.isArray(result.data)) {
    return { ok: true, mailboxes: [] };
  }

  const mailboxes = (result.data as Record<string, unknown>[])
    .map((row) => {
      const email = String(row.email || row.login || "");
      const usedMb = toNumber(row.diskused) ?? toNumber(row._diskused);
      const quotaRaw = row.diskquota ?? row._diskquota;
      const quotaMb =
        quotaRaw === "unlimited" || quotaRaw === "0" || quotaRaw === 0
          ? null
          : toNumber(quotaRaw);
      const percent =
        toNumber(row.diskusedpercent) ??
        (usedMb != null && quotaMb != null && quotaMb > 0
          ? Math.min(100, Math.round((usedMb / quotaMb) * 100))
          : null);
      return { email, usedMb, quotaMb, percent };
    })
    .filter((m) => m.email)
    .sort((a, b) => a.email.localeCompare(b.email));

  return { ok: true, mailboxes };
}
