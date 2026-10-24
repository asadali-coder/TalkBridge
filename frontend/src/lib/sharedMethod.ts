export function shouldNotifyInBackground(): boolean {
  return document.visibilityState === "hidden" || !document.hasFocus();
}

export async function ensurePermission(): Promise<boolean> {
  console.log("Notification supported?", "Notification" in window);
  console.log("Current permission:", window.Notification?.permission);

  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const p = await Notification.requestPermission();
  console.log("Request result:", p);

  return p === "granted";
}

export default function showNotification(title: string, body: string) {
  try {
    if (!("Notification" in window)) return;
    console.log("showNotification permission:", Notification.permission);

    const n = new Notification(title, { body });
    n.onclick = () => window.focus();
  } catch (e) {
    console.log("Notification error:", e);
  }
}
export const isUserBanned = (
  authUser: { bannedUntil?: string | null } | null,
) => {
  if (!authUser?.bannedUntil) return false;
  return new Date(authUser.bannedUntil).getTime() > Date.now();
};
