"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
const PwaSettings = dynamic(
  () => import("./pwa-settings").then((module) => module.PwaSettings),
  { loading: () => <p className="muted small">Loading app settings…</p> },
);
import { useRemote } from "./use-remote";
export function AccountSettings() {
  const account = useRemote<{ recoveryEmail: string | null }>("/api/account");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section style={{ maxWidth: 480 }}>
      <h2>Login & recovery</h2>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = e.currentTarget,
            f = new FormData(form);
          if (f.get("next") !== f.get("confirm")) {
            setMessage("New passwords don’t match.");
            return;
          }
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/account", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                current: f.get("current"),
                next: f.get("next"),
              }),
            });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            form.reset();
            setMessage(
              "Password changed. Other sessions have been signed out.",
            );
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ["current", "Current code or password"],
          ["next", "New password"],
          ["confirm", "Confirm new password"],
        ].map(([name, label]) => (
          <label className="field" key={name}>
            {label}
            <input
              name={name}
              type="password"
              minLength={name === "current" ? 4 : 14}
              maxLength={256}
              required
              autoComplete={
                name === "current" ? "current-password" : "new-password"
              }
            />
          </label>
        ))}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
        <p role="status">{message}</p>
      </form>
      <p>
        Recovery email:{" "}
        {account.loading
          ? "Loading…"
          : account.error || account.data?.recoveryEmail || "Not configured"}
      </p>
      <p className="muted">
        Email recovery is not enabled yet. An email service must be connected to
        send recovery links.
      </p>
      <PwaSettings />
    </section>
  );
}
