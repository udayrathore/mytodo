"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
export function Login({ configured }: { configured: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-form-side">
        <div className="login-form">
          <h1>Sign in</h1>
          {configured ? (
            <form onSubmit={submit} className="form-stack">
              <label className="field">
                <span>Email</span>
                <input
                  autoComplete="username"
                  type="email"
                  name="email"
                  required
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  autoComplete="current-password"
                  type="password"
                  name="password"
                  required
                  maxLength={1024}
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button disabled={busy} className="button primary">
                {busy ? (
                  "Opening your workspace…"
                ) : (
                  <>
                    Sign in <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="setup-note">
              <h3>One small step before you begin.</h3>
              <p>
                Configure your database connection, owner email, and password
                hash using the project README. Your workspace stays private
                until setup is complete.
              </p>
            </div>
          )}
          <small className="login-privacy">
            Single-user access. Your journal belongs to you.
          </small>
        </div>
      </section>
    </main>
  );
}
