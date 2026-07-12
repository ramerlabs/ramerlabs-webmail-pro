"use client";

import { useEffect, useId, useState } from "react";

const SCRIPT_SRC = "https://www.lacidaweb.com/embed.js";
const SERVE_URL = "https://www.lacidaweb.com/api/ads/serve";

type LacidaAd = {
  headline?: string;
  primaryText?: string;
  clickUrl?: string;
  ctaLabel?: string;
  format?: string;
};

function getVisitorId(): string {
  try {
    const key = "lw_visitor";
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "";
  }
}

function withVisitor(url: string, visitor: string): string {
  if (!visitor || !url) return url || "";
  return `${url}${url.includes("?") ? "&" : "?"}visitor=${encodeURIComponent(visitor)}`;
}

/** Inject HTML + run any <script> tags (React dangerouslySetInnerHTML skips scripts). */
function CustomAdHtml({ html }: { html: string }) {
  const ref = useId().replace(/:/g, "");
  useEffect(() => {
    const host = document.getElementById(`custom-ad-${ref}`);
    if (!host) return;
    host.innerHTML = "";
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const scripts: HTMLScriptElement[] = [];
    template.content.querySelectorAll("script").forEach((old) => {
      const script = document.createElement("script");
      for (const attr of old.attributes) {
        script.setAttribute(attr.name, attr.value);
      }
      script.text = old.textContent || "";
      scripts.push(script);
      old.remove();
    });
    host.appendChild(template.content);
    for (const script of scripts) {
      host.appendChild(script);
    }
  }, [html, ref]);

  return (
    <div id={`custom-ad-${ref}`} className="w-full overflow-hidden" />
  );
}

/**
 * Lacidaweb / custom ad slot — respects admin adsEnabled + ads code settings.
 */
export function LacidawebAd({ className }: { className?: string }) {
  const reactId = useId().replace(/:/g, "");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [placementId, setPlacementId] = useState("");
  const [customHtml, setCustomHtml] = useState("");
  const [ads, setAds] = useState<LacidaAd[] | null>(null);
  const [failed, setFailed] = useState(false);

  const targetId = `lacidaweb-ad-${placementId || "slot"}-${reactId}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/config/ads", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setEnabled(data.adsEnabled !== false);
        setPlacementId(
          typeof data.placementId === "string" ? data.placementId : "",
        );
        setCustomHtml(
          typeof data.customHtml === "string" ? data.customHtml : "",
        );
      } catch {
        if (!cancelled) setEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (enabled !== true) return;
    if (customHtml.trim()) return;
    if (!placementId) return;

    let cancelled = false;
    const visitor = getVisitorId();

    async function load() {
      try {
        const params = new URLSearchParams({
          placement: placementId,
          count: "3",
          _: String(Date.now()),
        });
        if (visitor) params.set("visitor", visitor);

        const res = await fetch(`${SERVE_URL}?${params.toString()}`, {
          credentials: "omit",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`serve ${res.status}`);
        const data = (await res.json()) as {
          ads?: LacidaAd[];
          ad?: LacidaAd;
        };
        const next =
          data.ads && data.ads.length
            ? data.ads
            : data.ad
              ? [data.ad]
              : [];
        if (!cancelled) {
          setAds(next);
          setFailed(false);
        }
      } catch {
        if (cancelled) return;
        setFailed(true);
        const w = window as Window & { __lacidawebEmbedBooted?: boolean };
        w.__lacidawebEmbedBooted = false;

        const target = document.getElementById(targetId);
        target?.removeAttribute("data-lw-mounted");

        document
          .querySelectorAll(`script[data-placement="${placementId}"]`)
          .forEach((node) => node.remove());

        const script = document.createElement("script");
        script.src = `${SCRIPT_SRC}?t=${Date.now()}`;
        script.async = true;
        script.dataset.placement = placementId;
        script.dataset.target = targetId;
        document.body.appendChild(script);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, placementId, customHtml, targetId]);

  if (enabled === false) return null;
  if (enabled === null) return null;

  if (customHtml.trim()) {
    return (
      <aside className={className} aria-label="Sponsored">
        <CustomAdHtml html={customHtml} />
      </aside>
    );
  }

  const visitor = typeof window !== "undefined" ? getVisitorId() : "";

  return (
    <aside className={className} aria-label="Sponsored">
      {ads && ads.length > 0 ? (
        <div className="flex w-full flex-wrap gap-2">
          {ads.map((ad, i) => (
            <a
              key={`${ad.headline}-${i}`}
              href={withVisitor(ad.clickUrl || "https://www.lacidaweb.com", visitor)}
              target="_blank"
              rel="noopener sponsored"
              className="min-w-[140px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 no-underline transition-colors hover:border-[var(--accent)]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                Sponsored
              </span>
              <div className="mt-1 text-xs font-semibold leading-snug text-[var(--foreground)]">
                {ad.headline}
              </div>
              {ad.primaryText ? (
                <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--muted-strong)]">
                  {ad.primaryText.slice(0, 400)}
                </div>
              ) : null}
              <span className="mt-2 inline-block text-[11px] font-semibold text-[var(--accent)]">
                {ad.ctaLabel || "Learn more"} →
              </span>
            </a>
          ))}
        </div>
      ) : ads && ads.length === 0 ? (
        <a
          href="https://www.lacidaweb.com/register/advertiser"
          target="_blank"
          rel="noopener sponsored"
          className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 no-underline"
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Sponsored
          </span>
          <div className="mt-1 text-xs font-semibold text-[var(--foreground)]">
            Advertise with lacidaweb
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted-strong)]">
            No paid ads in this slot right now — this is the network fill.
          </div>
        </a>
      ) : failed ? (
        <div
          id={targetId}
          className="lacidaweb-ad lacidaweb-manual min-h-[72px] w-full overflow-hidden"
        />
      ) : (
        <div className="min-h-[72px] animate-pulse rounded-lg bg-[var(--surface-muted)]" />
      )}
      <p className="mt-1.5 text-[9px] text-[var(--muted)]">Ads by lacidaweb</p>
    </aside>
  );
}
