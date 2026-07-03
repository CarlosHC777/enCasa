// Shared by the PIN API routes (Node runtime) and middleware.ts (Edge
// runtime), so this only uses the Web Crypto API (`crypto.subtle`), which is
// available as a global in both.

export const PIN_COOKIE_NAME = "encasa_pin";

// Arbitrary fixed message: the cookie value is an HMAC of this message keyed
// by FAMILY_PIN, so the cookie never contains the PIN itself (HttpOnly only
// blocks JS access, not someone reading it in browser devtools) and can't be
// forged without knowing FAMILY_PIN.
const PIN_MESSAGE = "encasa-pin-ok";

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function computePinCookieValue(familyPin: string): Promise<string> {
  return hmacHex(familyPin, PIN_MESSAGE);
}

export async function isValidPinCookieValue(
  cookieValue: string | undefined,
  familyPin: string | undefined
): Promise<boolean> {
  if (!cookieValue || !familyPin) return false;
  const expected = await computePinCookieValue(familyPin);
  return cookieValue === expected;
}
