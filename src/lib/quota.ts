import { ImapFlow } from "imapflow";
import { getImapConfig } from "@/lib/env";

export interface MailQuota {
  used: number;
  limit: number;
  percent: number;
  available: boolean;
}

function createClient(email: string, password: string) {
  const cfg = getImapConfig();
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: email, pass: password },
    logger: false,
  });
}

type QuotaResource = { usage?: number; limit?: number };

/**
 * Fetch mailbox quota via IMAP GETQUOTA / GETQUOTAROOT.
 * Values are returned in bytes when the server reports KB (RFC 2087).
 */
export async function fetchMailQuota(
  email: string,
  password: string,
): Promise<MailQuota> {
  const unavailable: MailQuota = {
    used: 0,
    limit: 0,
    percent: 0,
    available: false,
  };

  const client = createClient(email, password);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    const anyClient = client as ImapFlow & {
      getQuotaRoot?: (path: string) => Promise<unknown>;
      getQuota?: (root: string) => Promise<unknown>;
    };

    let usage: number | undefined;
    let limit: number | undefined;

    if (typeof anyClient.getQuotaRoot === "function") {
      const rootInfo = (await anyClient.getQuotaRoot("INBOX")) as
        | false
        | {
            quota?: Record<string, QuotaResource>;
          }
        | null;
      if (rootInfo && typeof rootInfo === "object") {
        const storage =
          rootInfo.quota?.STORAGE ||
          rootInfo.quota?.storage ||
          Object.values(rootInfo.quota || {})[0];
        usage = storage?.usage;
        limit = storage?.limit;
      }
    }

    if (
      (usage == null || limit == null) &&
      typeof anyClient.getQuota === "function"
    ) {
      const quota = (await anyClient.getQuota("")) as
        | false
        | {
            resources?: Record<string, QuotaResource>;
          }
        | Record<string, QuotaResource>
        | null;
      if (quota && typeof quota === "object") {
        const resources: Record<string, QuotaResource> =
          "resources" in quota &&
          quota.resources &&
          typeof quota.resources === "object"
            ? (quota.resources as Record<string, QuotaResource>)
            : (quota as Record<string, QuotaResource>);
        const storage =
          resources.STORAGE ||
          resources.storage ||
          Object.values(resources)[0];
        usage = storage?.usage ?? usage;
        limit = storage?.limit ?? limit;
      }
    }

    if (usage == null || limit == null || limit <= 0) {
      return unavailable;
    }

    // RFC 2087 reports STORAGE in KB
    const usedBytes = usage * 1024;
    const limitBytes = limit * 1024;
    const percent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));

    return {
      used: usedBytes,
      limit: limitBytes,
      percent,
      available: true,
    };
  } catch {
    return unavailable;
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

export function formatQuotaBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
