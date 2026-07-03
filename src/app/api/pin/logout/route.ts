import { NextResponse } from "next/server";
import { PIN_COOKIE_NAME } from "@/lib/pinAuth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(PIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
