"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  APP_WORKER_ENABLED,
  clearDevelopmentAppWorker,
  registerAppWorker,
} from "@/lib/pwa-client";
import { mayLeaveEditor } from "./navigation-guard";
import styles from "./pwa.module.css";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaState = {
  installed: boolean;
  appleMobile: boolean;
  canInstall: boolean;
  install: () => Promise<void>;
};
const PwaContext = createContext<PwaState>({
  installed: false,
  appleMobile: false,
  canInstall: false,
  install: async () => {},
});
export const usePwa = () => useContext(PwaContext);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [later, setLater] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const updating = useRef(false);
  useEffect(() => {
    if (!APP_WORKER_ENABLED) {
      void clearDevelopmentAppWorker().catch(() => {
        /* A browser can block cache access; development never registers a worker. */
      });
      return;
    }
    const mode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () =>
      setInstalled(
        mode.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    updateInstalled();
    setAppleMobile(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    const available = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const complete = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    mode.addEventListener("change", updateInstalled);
    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;
    let candidate: ServiceWorker | null = null;
    const observe = () => {
      candidate = registration?.installing || null;
      candidate?.addEventListener("statechange", changed);
      if (registration?.waiting) setWaiting(registration.waiting);
    };
    const changed = () => {
      if (
        !cancelled &&
        candidate?.state === "installed" &&
        navigator.serviceWorker.controller
      )
        setWaiting(registration?.waiting || candidate);
    };
    const controller = () => {
      if (updating.current) window.location.reload();
    };
    const register = () => {
      if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
      void registerAppWorker()
        .then((next) => {
          if (cancelled) return;
          registration = next;
          observe();
          registration.addEventListener("updatefound", observe);
        })
        .catch(() => {
          /* Installation remains available where supported; settings show registration errors. */
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.addEventListener("controllerchange", controller);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      window.removeEventListener("load", register);
      mode.removeEventListener("change", updateInstalled);
      registration?.removeEventListener("updatefound", observe);
      candidate?.removeEventListener("statechange", changed);
      if ("serviceWorker" in navigator)
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          controller,
        );
    };
  }, []);
  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }
  function update() {
    if (!waiting) return;
    if (document.querySelector("dialog[open]") || !mayLeaveEditor()) {
      setUpdateMessage("Save your work and close the editor before updating.");
      return;
    }
    updating.current = true;
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }
  return (
    <PwaContext.Provider
      value={{ installed, appleMobile, canInstall: !!installEvent, install }}
    >
      {children}
      {waiting && !later && (
        <aside className={styles.update} role="status">
          <div>
            <strong>App update ready</strong>
            <span>
              {updateMessage || "Save your work, then reload to update."}
            </span>
          </div>
          <button type="button" onClick={update}>
            Reload update
          </button>
          <button type="button" onClick={() => setLater(true)}>
            Later
          </button>
        </aside>
      )}
    </PwaContext.Provider>
  );
}
