import { create } from "zustand";

export const useThemeStore = create<{
  theme: string;
  setTheme: (theme: string) => void;
}>((set) => ({
  theme: localStorage.getItem("chat-theme") || "business",
  setTheme: (theme: string) => {
    localStorage.setItem("chat-theme", theme);
    set({ theme });
  },
}));
