import { create } from "zustand";

export interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const displayMode = window.matchMedia("(display-mode: standalone)");
const standalone = () =>
  displayMode.matches ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone;

export const useInstallStore = create<{
  prompt: InstallEvent | null;
  installed: boolean;
}>(() => ({ prompt: null, installed: standalone() }));

// Register at module load, before React waits for the authentication request.
// Keep the one-use event even if the navbar has not mounted yet.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  useInstallStore.setState({ prompt: event as InstallEvent });
});
window.addEventListener("appinstalled", () => {
  useInstallStore.setState({ prompt: null, installed: true });
});
displayMode.addEventListener("change", () => {
  if (standalone()) useInstallStore.setState({ prompt: null, installed: true });
});
