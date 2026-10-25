import { useLayoutEffect } from "react";

// Keyboard-aware sizing is scoped to chat; other pages keep normal document scrolling.
export default function useChatViewport() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const oldRootOverflow = root.style.overflow;
    const oldBodyOverflow = document.body.style.overflow;
    const properties = ["--chat-viewport-height", "--chat-viewport-top"];
    const previous = properties.map((name) =>
      root.style.getPropertyValue(name),
    );
    let frame = 0;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const update = () => {
      // Preserve browser pinch zoom; do not resize the chat around a zoomed viewport.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      root.style.setProperty(
        "--chat-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      root.style.setProperty(
        "--chat-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.style.overflow = oldRootOverflow;
      document.body.style.overflow = oldBodyOverflow;
      properties.forEach((name, index) => {
        if (previous[index]) root.style.setProperty(name, previous[index]);
        else root.style.removeProperty(name);
      });
    };
  }, []);
}
