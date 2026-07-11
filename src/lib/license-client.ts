import {
  getLicenseProductSlug,
  getLicenseServerUrl,
} from "@/lib/rlm-internal";

export interface LicenseApiResult {
  success: boolean;
  message?: string;
  code?: string;
  data?: Record<string, unknown>;
}

function apiBase(): string {
  return `${getLicenseServerUrl()}/wp-json/ramerlabs-license/v1`;
}

async function post(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<LicenseApiResult> {
  try {
    const res = await fetch(`${apiBase()}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as LicenseApiResult;
    if (!res.ok && data.success === undefined) {
      return {
        success: false,
        code: "http_error",
        message: data.message || `License server returned HTTP ${res.status}`,
      };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      code: "network_error",
      message:
        err instanceof Error
          ? err.message
          : "Could not reach the license server",
    };
  }
}

/** Stable install id used as machine_id / site activation slot. */
export function getInstallId(saved?: string | null): string {
  if (saved && saved.length >= 8) return saved;
  return `webmail-${process.env.VERCEL_URL || "local"}-${process.env.MAIL_DOMAIN || "install"}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64);
}

export async function activateLicense(
  licenseKey: string,
  installId: string,
): Promise<LicenseApiResult> {
  return post("activate", {
    license_key: licenseKey.trim(),
    product_slug: getLicenseProductSlug(),
    machine_id: installId,
    device_name: "RamerLabs Webmail Pro",
    site_url: process.env.NEXT_PUBLIC_APP_URL || undefined,
  });
}

export async function validateLicense(
  licenseKey: string,
  installId: string,
): Promise<LicenseApiResult> {
  return post("validate", {
    license_key: licenseKey.trim(),
    product_slug: getLicenseProductSlug(),
    machine_id: installId,
  });
}

export async function deactivateLicense(
  licenseKey: string,
  installId: string,
): Promise<LicenseApiResult> {
  return post("deactivate", {
    license_key: licenseKey.trim(),
    product_slug: getLicenseProductSlug(),
    machine_id: installId,
  });
}
