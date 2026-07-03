"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useActiveProfile } from "@/context/ProfileContext";

export default function PinPage() {
  const router = useRouter();
  const { activeProfileId, ready } = useActiveProfile();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        setError("PIN incorrecto");
        return;
      }
      router.replace(ready && activeProfileId ? "/" : "/login");
    } catch {
      setError("No se pudo verificar el PIN");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-title">
        <h1>enCasa</h1>
        <p>Ingresa el PIN familiar</p>
      </div>

      <form className="pin-form" onSubmit={handleSubmit}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
        />
        {error && <div className="status-banner error">{error}</div>}
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
