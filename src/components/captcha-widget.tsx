"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onRecaptchaSuccess?: (token: string) => void;
    onRecaptchaExpired?: () => void;
    grecaptcha?: {
      reset: () => void;
      getResponse: () => string;
    };
  }
}

interface CaptchaWidgetProps {
  provider: "turnstile" | "recaptcha" | "none";
  siteKey: string;
  onToken: (token: string | null) => void;
}

export function CaptchaWidget({
  provider,
  siteKey,
  onToken,
}: CaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Never auto-bypass with a fake token — server rejects those.
    if (provider === "none") {
      onToken(null);
      return;
    }

    if (!siteKey) {
      onToken(null);
      return;
    }

    if (provider === "turnstile") {
      const scriptId = "cf-turnstile-script";
      const existing = document.getElementById(scriptId);

      const render = () => {
        if (!containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
        }
        containerRef.current.innerHTML = "";
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
          theme: "light",
        });
      };

      if (window.turnstile) {
        render();
      } else if (!existing) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = render;
        document.body.appendChild(script);
      } else {
        existing.addEventListener("load", render);
        return () => existing.removeEventListener("load", render);
      }

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
        }
      };
    }

    if (provider === "recaptcha") {
      window.onRecaptchaSuccess = (token: string) => onToken(token);
      window.onRecaptchaExpired = () => onToken(null);
      const scriptId = "grecaptcha-script";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://www.google.com/recaptcha/api.js";
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
    }
  }, [provider, siteKey, onToken]);

  if (provider === "none") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Captcha disabled (dev insecure mode only).
      </p>
    );
  }

  if (!siteKey) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Captcha site key is missing. Signup is blocked until configured.
      </p>
    );
  }

  if (provider === "recaptcha") {
    return (
      <div className="flex justify-center">
        <div
          className="g-recaptcha"
          data-sitekey={siteKey}
          data-callback="onRecaptchaSuccess"
          data-expired-callback="onRecaptchaExpired"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        Security check
      </p>
      <div ref={containerRef} className="flex justify-center" />
    </div>
  );
}
