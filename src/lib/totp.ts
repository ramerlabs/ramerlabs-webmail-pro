import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotp(secret: string, email: string): TOTP {
  return new TOTP({
    issuer: "RamerLabs Webmail",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const totp = buildTotp(secret, "verify");
  const delta = totp.validate({ token: token.replace(/\s+/g, ""), window: 1 });
  return delta !== null;
}

export async function totpQrDataUrl(
  secret: string,
  email: string,
): Promise<{ uri: string; qrDataUrl: string }> {
  const totp = buildTotp(secret, email);
  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 220,
    color: { dark: "#1a1c1e", light: "#ffffff" },
  });
  return { uri, qrDataUrl };
}
