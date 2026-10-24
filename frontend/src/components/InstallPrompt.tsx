import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  const help = useRef<HTMLDialogElement>(null);
  const ios =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
      help.current?.close();
    };
    const onDisplayMode = () => {
      setInstalled(
        displayMode.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", onDisplayMode);
    };
  }, []);

  const install = async () => {
    if (!event) {
      help.current?.showModal();
      return;
    }
    setInstalling(true);
    setEvent(null); // Each native prompt can only be used once.
    try {
      await event.prompt();
      await event.userChoice;
      // Only appinstalled / standalone mode confirms installation completed.
    } catch {
      help.current?.showModal();
    } finally {
      setInstalling(false);
    }
  };

  if (installed) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm gap-1.5 px-2 sm:px-3 shrink-0"
        onClick={install}
        disabled={installing}
      >
        <Download className="size-4" aria-hidden="true" />
        <span>{installing ? "Installing…" : "Install App"}</span>
      </button>
      <dialog ref={help} className="modal" aria-labelledby="install-title">
        <div className="modal-box max-w-sm">
          <form method="dialog">
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              aria-label="Close install instructions"
            >
              <X className="size-4" />
            </button>
          </form>
          <h2 id="install-title" className="font-bold text-lg pr-8">
            Install TalkBridge
          </h2>
          <p className="text-sm opacity-70 mt-2">
            Add TalkBridge to your home screen to open it like an app.
          </p>
          {!window.isSecureContext ? (
            <p className="mt-4 text-sm">
              Open the HTTPS version of TalkBridge in your mobile browser to
              install the app. A local HTTP network address does not support app
              installation.
            </p>
          ) : ios ? (
            <ol className="list-decimal pl-5 mt-4 space-y-2 text-sm">
              <li>Open this website in Safari.</li>
              <li>Tap Share, then Add to Home Screen.</li>
              <li>Tap Add to finish installing.</li>
            </ol>
          ) : (
            <p className="mt-4 text-sm">
              Open your browser menu and choose Install app or Add to Home screen.
              If the option is missing, open this website in Chrome or Edge and
              try again once the page has loaded. If already installed, open
              TalkBridge from your home screen.
            </p>
          )}
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-primary btn-sm">Got it</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button aria-label="Close install instructions">close</button>
        </form>
      </dialog>
    </>
  );
}
