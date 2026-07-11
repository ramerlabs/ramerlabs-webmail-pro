/**
 * RamerLabs internal license config — never expose server URL or product slug in UI.
 */
function joinParts(parts: string[]): string {
  return parts.join("");
}

/** License server base URL (obfuscated). */
export function getLicenseServerUrl(): string {
  // Prefer env override for local LM testing only; production uses split URL.
  const override = process.env.RLM_LICENSE_SERVER?.trim();
  if (override) return override.replace(/\/$/, "");
  return joinParts(["https://", "plugins.", "ramerlabs", ".com"]);
}

/** Product slug for License Manager (not shown in customer UI). */
export function getLicenseProductSlug(): string {
  const override = process.env.RLM_PRODUCT_SLUG?.trim();
  if (override) return override;
  return joinParts(["ramerlabs-", "webmail-", "pro"]);
}

export const RLM_PRODUCT_NAME = "RamerLabs Webmail Pro";
export const RLM_SUPPORT_EMAIL = "support@ramerlabs.com";
export const RLM_COMPANY_URL = "https://ramerlabs.com";
