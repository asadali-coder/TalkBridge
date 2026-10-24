let unlocked = false;

const notifyAudio: HTMLAudioElement = new Audio("/sounds/notify.mp3");
notifyAudio.preload = "auto";
notifyAudio.volume = 0.7;

export const soundManager = {
  unlockOnce(): void {
    const unlock = async (): Promise<void> => {
      if (unlocked) return;
      try {
        await notifyAudio.play();
        notifyAudio.pause();
        notifyAudio.currentTime = 0;
        unlocked = true;
      } catch {
        /* Browser may require another user gesture. */
      }
    };

    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
  },

  playNotify(): void {
    if (!unlocked) return;
    notifyAudio.currentTime = 0;
    void notifyAudio.play().catch(() => {});
  },
};
