import { getCaptchaConfig, type CaptchaProvider } from "@/lib/env";

export interface CaptchaVerifyResult {
  ok: boolean;
  error?: string;
}

function clientIp(request?: Request): string | undefined {
  if (!request) return undefined;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

/**
 * Fail-closed captcha verification for signup.
 * Provider "none" is only allowed when ALLOW_INSECURE_SIGNUP=true AND NODE_ENV=development.
 */
export function assertCaptchaConfigured(): CaptchaVerifyResult {
  const config = getCaptchaConfig();
  const allowInsecure =
    process.env.ALLOW_INSECURE_SIGNUP === "true" &&
    process.env.NODE_ENV === "development";

  if (config.provider === "none") {
    if (!allowInsecure) {
      return {
        ok: false,
        error:
          "Signup is locked: captcha is required. Set CAPTCHA_PROVIDER to turnstile or recaptcha.",
      };
    }
    return { ok: true };
  }

  if (config.provider === "turnstile") {
    if (!config.turnstileSiteKey || !config.turnstileSecret) {
      return {
        ok: false,
        error:
          "Cloudflare Turnstile is not fully configured (site key + secret required).",
      };
    }
    return { ok: true };
  }

  if (config.provider === "recaptcha") {
    if (!config.recaptchaSiteKey || !config.recaptchaSecret) {
      return {
        ok: false,
        error:
          "Google reCAPTCHA is not fully configured (site key + secret required).",
      };
    }
    return { ok: true };
  }

  return { ok: false, error: "Unknown captcha provider." };
}

export async function verifyCaptcha(
  token: string | undefined | null,
  request?: Request,
): Promise<CaptchaVerifyResult> {
  const config = getCaptchaConfig();
  const configured = assertCaptchaConfigured();
  if (!configured.ok) return configured;

  if (config.provider === "none") {
    // Only reachable when ALLOW_INSECURE_SIGNUP is enabled in development
    return { ok: true };
  }

  if (!token || token === "dev-bypass" || token.length < 20) {
    return { ok: false, error: "Please complete the captcha challenge." };
  }

  const ip = clientIp(request);

  if (config.provider === "turnstile") {
    const form = new URLSearchParams();
    form.set("secret", config.turnstileSecret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form, cache: "no-store" },
    );
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (!data.success) {
      return {
        ok: false,
        error: "Captcha verification failed. Please try again.",
      };
    }
    return { ok: true };
  }

  if (config.provider === "recaptcha") {
    const form = new URLSearchParams();
    form.set("secret", config.recaptchaSecret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);

    const res = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      { method: "POST", body: form, cache: "no-store" },
    );
    const data = (await res.json()) as { success?: boolean };

    if (!data.success) {
      return {
        ok: false,
        error: "Captcha verification failed. Please try again.",
      };
    }
    return { ok: true };
  }

  return { ok: false, error: "Unknown captcha provider." };
}

export function getPublicCaptchaConfig(): {
  provider: CaptchaProvider;
  siteKey: string;
  ready: boolean;
  error?: string;
} {
  const config = getCaptchaConfig();
  const check = assertCaptchaConfigured();

  if (config.provider === "none") {
    return {
      provider: "none",
      siteKey: "",
      ready: check.ok,
      error: check.error,
    };
  }

  const siteKey =
    config.provider === "recaptcha"
      ? config.recaptchaSiteKey
      : config.turnstileSiteKey;

  return {
    provider: config.provider,
    siteKey,
    ready: check.ok && Boolean(siteKey),
    error: check.ok ? undefined : check.error,
  };
}
