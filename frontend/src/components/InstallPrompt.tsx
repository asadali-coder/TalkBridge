import { useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { useInstallStore } from "../lib/installApp";

export default function InstallPrompt() {
  const { prompt: event, installed } = useInstallStore();
  const [installing, setInstalling] = useState(false);
  const help = useRef<HTMLDialogElement>(null);
  const ios =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const install = async () => {
    if (!event) {
      help.current?.showModal();
      return;
    }
    help.current?.close();
    setInstalling(true);
    useInstallStore.setState({ prompt: null }); // Each native prompt can only be used once.
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
        disabled={installing}>
        <Download className="size-4" aria-hidden="true" />
        <span>{installing ? "Installing…" : "Install App"}</span>
      </button>
      <dialog ref={help} className="modal" aria-labelledby="install-title">
        <div className="modal-box max-w-sm">
          <form method="dialog">
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              aria-label="Close install instructions">
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
            <div className="mt-4 space-y-3 text-sm">
              <p>
                {event
                  ? "Your browser is ready. Tap Install now below."
                  : "Your browser has not made the installation prompt available yet."}
              </p>
              <p>
                In Chrome on Android, tap the page and keep it open for at least
                30 seconds, then try Install App again. You can also open the
                three-dot browser menu and choose Add to Home screen → Install.
              </p>
              <p className="text-xs opacity-70">
                Use a normal browser tab. If TalkBridge is already installed,
                open it from your home screen.
              </p>
            </div>
          )}
          <div className="modal-action">
            {event && !ios && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={install}
                disabled={installing}>
                Install now
              </button>
            )}
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
