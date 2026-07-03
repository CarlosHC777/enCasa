import { NextRequest, NextResponse } from "next/server";
import { PIN_COOKIE_NAME, isValidPinCookieValue } from "@/lib/pinAuth";

// Broad net at the matcher level; the exact allowlist below is checked
// against the literal pathname, which is easier to reason about than a
// single hand-rolled regex.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const PUBLIC_PATHS = new Set([
  "/pin",
  "/api/pin/login",
  "/api/pin/logout",
  "/icon.svg",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const familyPin = process.env.FAMILY_PIN;
  if (!familyPin) {
    // No PIN configured: don't lock everyone out of a misconfigured deploy.
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(PIN_COOKIE_NAME)?.value;
  const valid = await isValidPinCookieValue(cookieValue, familyPin);
  if (valid) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/pin";
  url.search = "";
  return NextResponse.redirect(url);
}
