"use client";
import { useEffect, useRef, useState } from "react";
import { usePwa } from "./pwa-provider";
import {
  decodePushKey,
  pushEndpointHash,
  activeAppWorker,
  APP_WORKER_ENABLED,
} from "@/lib/pwa-client";
import styles from "./pwa.module.css";

type PushConfig = {
  configured: boolean;
  publicKey: string | null;
  timezone: string;
  schedule: number[];
  pendingScope: "ALL";
  subscriptionHashes?: string[];
};
async function write(
  action: "subscribe" | "unsubscribe" | "test",
  value: Record<string, unknown>,
) {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...value }),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "Could not update notifications.");
  return result;
}
export function PwaSettings() {
  const pwa = usePwa();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [registered, setRegistered] = useState(false);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const available =
      APP_WORKER_ENABLED &&
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(available);
    if (available) setPermission(Notification.permission);
    const device = available
      ? activeAppWorker().then((worker) => worker.pushManager.getSubscription())
      : Promise.resolve(null);
    Promise.all([
      fetch("/api/push", { cache: "no-store", signal: controller.signal }).then(
        async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw Error(data.error || "Could not load notification settings.");
          return data as PushConfig;
        },
      ),
      device,
    ])
      .then(async ([settings, local]) => {
        const hash = local ? await pushEndpointHash(local.endpoint) : null;
        if (!live) return;
        setConfig(settings);
        setSubscription(local);
        setRegistered(!!hash && !!settings.subscriptionHashes?.includes(hash));
      })
      .catch((cause) => {
        if (live)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load notification settings.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [revision]);
  useEffect(() => {
    const sync = () => {
      if ("Notification" in window) setPermission(Notification.permission);
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  async function enable() {
    if (
      pending.current ||
      !supported ||
      !config?.configured ||
      !config.publicKey
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Request directly from this click, before any network or worker awaits.
      const allowed =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      setPermission(allowed);
      if (allowed !== "granted")
        throw Error(
          allowed === "denied"
            ? "Notifications are blocked. Allow them in this browser’s site settings, then try again."
            : "Notification permission wasn’t granted. You can enable it later.",
        );
      const worker = await activeAppWorker();
      const key = decodePushKey(config.publicKey);
      let local = await worker.pushManager.getSubscription();
      const existing = local?.options.applicationServerKey;
      if (local && existing && !equalKey(new Uint8Array(existing), key)) {
        await write("unsubscribe", { endpoint: local.endpoint });
        await local.unsubscribe();
        local = null;
      }
      if (!local)
        local = await worker.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      setSubscription(local);
      await write("subscribe", { subscription: local.toJSON() });
      setRegistered(true);
      setMessage("Daily summaries are enabled on this device.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not enable notifications.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function disable() {
    if (pending.current || !subscription) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await write("unsubscribe", { endpoint: subscription.endpoint });
      setRegistered(false);
      try {
        await subscription.unsubscribe();
        setSubscription(null);
      } catch {
        /* Server-side delivery is already disabled for this endpoint. */
      }
      setMessage("Daily summaries are turned off on this device.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not turn off notifications.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function test() {
    if (pending.current || !subscription) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await write("test", { endpoint: subscription.endpoint });
      setMessage("Test summary sent. Check your device’s notifications.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send a test summary.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.settings} aria-label="App and notifications">
      <h2>App & notifications</h2>
      <div className={styles.setting}>
        <h3>Install Tasks</h3>
        {pwa.installed ? (
          <p>Tasks is installed on this device.</p>
        ) : (
          <>
            <p>Open Tasks as an app from your home screen or dock.</p>
            {pwa.canInstall ? (
              <button
                className="button"
                type="button"
                onClick={() =>
                  void pwa
                    .install()
                    .catch(() =>
                      setError(
                        "Use your browser’s Install app option to finish installing.",
                      ),
                    )
                }
              >
                Install app
              </button>
            ) : (
              <p className="muted small">
                {pwa.appleMobile
                  ? "Use Share → Add to Home Screen, then open the installed app."
                  : "Use your browser’s Install app, Add to Dock, or Add to Home Screen option."}
              </p>
            )}
          </>
        )}
      </div>
      <div className={styles.setting}>
        <h3>Daily task summaries</h3>
        <p>
          9:00 am and 8:00 pm{config?.timezone ? ` · ${config.timezone}` : ""}
        </p>
        <p className="muted small">
          Completed today and all pending tasks, including future and undated
          tasks, across every category.
        </p>
        {loading ? (
          <p role="status" className="muted small">
            Loading notification settings…
          </p>
        ) : supported ? (
          <>
            {!config?.configured && (
              <p className="muted small">
                Notification delivery is being set up. Try again after setup is
                complete.
              </p>
            )}
            {permission === "denied" && (
              <p className="muted small">
                Notifications are blocked in this browser’s site settings.
              </p>
            )}
            {registered ? (
              <>
                <p className={styles.status}>
                  {permission === "granted"
                    ? "Enabled on this device"
                    : "Registered here; allow browser notifications to receive summaries."}
                </p>
                <div className={styles.actions}>
                  <button
                    className="button"
                    type="button"
                    disabled={
                      busy || permission !== "granted" || !config?.configured
                    }
                    onClick={() => void test()}
                  >
                    Send test summary
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void disable()}
                  >
                    Turn off this device
                  </button>
                </div>
              </>
            ) : (
              <button
                className="button primary"
                type="button"
                disabled={busy || !config?.configured}
                onClick={() => void enable()}
              >
                {busy ? "Enabling…" : "Enable notifications"}
              </button>
            )}
            <p className="muted small">
              Notifications stay enabled here until you turn them off or change
              your browser’s notification settings.
            </p>
          </>
        ) : (
          <p className="muted small">
            {!APP_WORKER_ENABLED
              ? "App installation and notifications are available in the production app."
              : pwa.appleMobile && !pwa.installed
                ? "Install Tasks on your Home Screen and open it there to enable notifications."
                : "Push notifications aren’t available in this browser. Open Tasks in a browser that supports Web Push."}
          </p>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
          {!config && !loading && (
            <button
              className="text-button"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              {" "}
              Reload settings
            </button>
          )}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
function equalKey(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
