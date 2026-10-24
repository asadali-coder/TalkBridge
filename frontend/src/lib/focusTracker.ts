type FocusState = {
  isWindowFocused: boolean;
  visibility: DocumentVisibilityState;
};

let state: FocusState = {
  isWindowFocused: true,
  visibility: document.visibilityState,
};

const listeners = new Set<(s: FocusState) => void>();

function emit() {
  listeners.forEach((fn) => fn(state));
}

window.addEventListener("focus", () => {
  state = { ...state, isWindowFocused: true };
  emit();
});

window.addEventListener("blur", () => {
  state = { ...state, isWindowFocused: false };
  emit();
});

document.addEventListener("visibilitychange", () => {
  state = { ...state, visibility: document.visibilityState };
  emit();
});

export const focusTracker = {
  get(): FocusState {
    return state;
  },
  subscribe(fn: (s: FocusState) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
