import { NextRequest, NextResponse } from "next/server";
import { PIN_COOKIE_NAME, computePinCookieValue } from "@/lib/pinAuth";

export async function POST(request: NextRequest) {
  const familyPin = process.env.FAMILY_PIN;

  let pin = "";
  try {
    const body = await request.json();
    if (typeof body?.pin === "string") pin = body.pin;
  } catch {
    // Malformed body: falls through and fails the comparison below.
  }

  if (!familyPin || pin !== familyPin) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(PIN_COOKIE_NAME, await computePinCookieValue(familyPin), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
