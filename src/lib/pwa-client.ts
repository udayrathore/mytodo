let worker: Promise<ServiceWorkerRegistration> | null = null;
export const APP_WORKER_ENABLED = process.env.NODE_ENV === "production";

export async function clearDevelopmentAppWorker() {
  if (APP_WORKER_ENABLED || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const script = new URL("/sw.js", window.location.origin).href;
  const ours =
    registration &&
    [registration.active, registration.waiting, registration.installing].some(
      (candidate) => candidate?.scriptURL === script,
    );
  if (ours) {
    registration.active?.postMessage({ type: "CLEAR_APP_CACHES" });
    await registration.unregister();
  }
  if ("caches" in window) {
    const names = await window.caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith("tasks-public-"))
        .map((name) => window.caches.delete(name)),
    );
  }
}

export function registerAppWorker(): Promise<ServiceWorkerRegistration> {
  if (!APP_WORKER_ENABLED)
    return Promise.reject(
      new Error(
        "App installation and notifications are available in production.",
      ),
    );
  if (!("serviceWorker" in navigator) || !window.isSecureContext)
    return Promise.reject(
      new Error(
        "This browser needs a secure connection for app installation and notifications.",
      ),
    );
  if (!worker)
    worker = navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => {
        worker = null;
        throw error;
      });
  return worker;
}

export async function activeAppWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await registerAppWorker();
  if (registration.active) return registration;
  let timer: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () =>
            reject(
              new Error(
                "App installation could not finish. Reconnect and try again.",
              ),
            ),
          10000,
        );
      }),
    ]);
  } catch (error) {
    worker = null;
    throw error;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export function decodePushKey(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export async function pushEndpointHash(endpoint: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
