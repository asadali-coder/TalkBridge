import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
export default function AccountRestriction() {
  const user = useAuthStore((state) => state.authUser);
  const until = user?.bannedUntil ? new Date(user.bannedUntil).getTime() : 0;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!until || until <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) {
        clearInterval(timer);
        useAuthStore.setState((state) => ({
          authUser: state.authUser
            ? { ...state.authUser, bannedUntil: null }
            : null,
        }));
        void useAuthStore.getState().checkAuth();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until || until <= now) return null;
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  const remaining = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return (
    <aside
      style={{ top: "calc(var(--chat-viewport-top, 0px) + 4rem)" }}
      role="alert"
      data-testid="account-restriction"
      className="fixed inset-x-0 top-16 z-40 h-[88px] border-b border-red-300 bg-red-50 text-red-900">
      <div className="max-w-6xl mx-auto h-full px-4 flex items-center gap-3">
        <ShieldAlert className="size-6 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <strong className="block text-sm">
            Messaging blocked for 24 hours
          </strong>
          <p className="text-xs">Vulgar or abusive content detected.</p>
          <p className="text-xs" title={new Date(until).toLocaleString()}>
            Resumes in{" "}
            <span className="font-semibold tabular-nums">{remaining}</span>
            <span className="sr-only">
              . Until {new Date(until).toLocaleString()}
            </span>
          </p>
        </div>
      </div>
    </aside>
  );
}
