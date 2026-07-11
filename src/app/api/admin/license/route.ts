import { NextResponse } from "next/server";
import { z } from "zod";
import {
  activateLicense,
  deactivateLicense,
  getInstallId,
  validateLicense,
} from "@/lib/license-client";
import {
  getLicenseState,
  isLicenseActive,
  saveLicenseState,
} from "@/lib/license-store";
import { RLM_COMPANY_URL, RLM_SUPPORT_EMAIL } from "@/lib/rlm-internal";
import { requireAdminAccess } from "@/lib/session";

export const runtime = "nodejs";

const keySchema = z.object({
  licenseKey: z.string().optional(),
  action: z.enum(["activate", "validate", "deactivate"]).default("activate"),
  useStored: z.boolean().optional(),
});

export async function GET() {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getLicenseState();
  const active = await isLicenseActive();
  return NextResponse.json({
    activated: active,
    hasKey: Boolean(state.licenseKey),
    licenseKeyMasked: state.licenseKey
      ? `${state.licenseKey.slice(0, 4)}••••${state.licenseKey.slice(-4)}`
      : "",
    installId: state.installId || getInstallId(null),
    lastValidatedAt: state.lastValidatedAt,
    lastMessage: state.lastMessage,
    supportEmail: RLM_SUPPORT_EMAIL,
    companyUrl: RLM_COMPANY_URL,
  });
}

export async function POST(request: Request) {
  const session = await requireAdminAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = keySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const current = await getLicenseState();
    const installId = getInstallId(current.installId);
    const action = parsed.data.action;
    const key = (
      parsed.data.useStored || !parsed.data.licenseKey?.trim()
        ? current.licenseKey
        : parsed.data.licenseKey || ""
    ).trim();

    if (!key || key.length < 8) {
      return NextResponse.json(
        { error: "A valid license key is required" },
        { status: 400 },
      );
    }

    let result;
    if (action === "deactivate") {
      result = await deactivateLicense(key, installId);
      await saveLicenseState({
        ...current,
        licenseKey: result.success ? "" : key,
        installId,
        activated: false,
        lastValidatedAt: new Date().toISOString(),
        lastMessage: result.message || "Deactivated",
      });
    } else if (action === "validate") {
      result = await validateLicense(key, installId);
      await saveLicenseState({
        ...current,
        licenseKey: key,
        installId,
        activated: Boolean(result.success),
        lastValidatedAt: new Date().toISOString(),
        lastMessage: result.message || (result.success ? "Valid" : "Invalid"),
      });
    } else {
      result = await activateLicense(key, installId);
      await saveLicenseState({
        ...current,
        licenseKey: key,
        installId,
        activated: Boolean(result.success),
        lastValidatedAt: new Date().toISOString(),
        lastMessage:
          result.message ||
          (result.success ? "License activated" : "Activation failed"),
      });
    }

    return NextResponse.json({
      ok: Boolean(result.success),
      success: Boolean(result.success),
      message: result.message,
      code: result.code,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "License request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
