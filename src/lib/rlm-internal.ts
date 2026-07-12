/**
 * RamerLabs internal license config — never expose server URL or product slug in UI.
 */
function joinParts(parts: string[]): string {
  return parts.join("");
}

/** License server base URL (obfuscated). Always ramerlabs.com — no plugins subdomain. */
export function getLicenseServerUrl(): string {
  return joinParts(["https://", "ramerlabs", ".com"]);
}

/** Product slug for License Manager (not shown in customer UI). */
export function getLicenseProductSlug(): string {
  return joinParts(["ramerlabs-", "webmail-", "pro"]);
}

export const RLM_PRODUCT_NAME = "RamerLabs Webmail Pro";
export const RLM_SUPPORT_EMAIL = "support@ramerlabs.com";
export const RLM_COMPANY_URL = "https://ramerlabs.com";

/** User-facing message when the product license is inactive (no server URL / slug). */
export const LICENSE_INACTIVE_MESSAGE =
  "RamerLabs Webmail Pro is not active. Please get a license key at ramerlabs.com to unlock this feature.";
