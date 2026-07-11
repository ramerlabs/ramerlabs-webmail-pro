import { NextResponse } from "next/server";
import { getPublicCaptchaConfig } from "@/lib/captcha";

export async function GET() {
  const captcha = getPublicCaptchaConfig();
  return NextResponse.json({
    provider: captcha.provider,
    siteKey: captcha.siteKey,
    ready: captcha.ready,
  });
}
