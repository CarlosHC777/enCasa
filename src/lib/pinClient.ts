export async function logoutPin(): Promise<void> {
  await fetch("/api/pin/logout", { method: "POST" });
}
