import { useState } from "react";
import NoChatSelected from "../components/NoChatSelected";
import { useChatStore } from "../store/useChatStore";
import ChatContainer from "../components/ChatContainer";
import Sidebar from "../components/Sidebar";

const HomePage = () => {
  const { selectedUser, users } = useChatStore();
  const totalUnread = users.reduce(
    (total, user) => total + (user.unreadCount || 0),
    0,
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="h-[calc(100dvh-var(--ban-offset,0px))] bg-base-200">
      <div className="flex items-center justify-center pt-20 px-4">
        <div className="bg-base-100 rounded-lg shadow-cl w-full max-w-6xl h-[calc(100dvh-6rem-var(--ban-offset,0px))] relative overflow-hidden">
          <div className="flex h-full rounded-lg overflow-hidden">
            <div className="hidden lg:block">
              <Sidebar />
            </div>
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <div
                className={
                  "lg:hidden border-b border-base-300 p-3 flex items-center justify-between"
                }
              >
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setMobileSidebarOpen(true)}
                  type="button"
                >
                  {/* simple icon */}
                  <span className="text-xl leading-none">☰</span>
                  {totalUnread > 0 && (
                    <span
                      data-testid="mobile-unread-total"
                      className="min-w-5 h-5 px-1 rounded-full bg-emerald-500 text-white text-xs inline-flex items-center justify-center"
                    >
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </button>
              </div>
              {!selectedUser ? (
                <NoChatSelected />
              ) : (
                <ChatContainer
                  key={selectedUser._id}
                  readingEnabled={!mobileSidebarOpen}
                />
              )}
            </div>
          </div>

          {/* Mobile */}
          <div
            className={`lg:hidden absolute inset-0 z-50 transition ${
              mobileSidebarOpen ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <div
              className={`absolute inset-0 bg-black/40 transition-opacity ${
                mobileSidebarOpen ? "opacity-100" : "opacity-0"
              }`}
              onClick={() => setMobileSidebarOpen(false)}
            />

            {/* drawer panel */}
            <div
              className={`absolute left-0 top-0 h-full w-[85%] max-w-sm bg-base-100 border-r border-base-300 transition-transform duration-200 ${
                mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <Sidebar onSelectUser={() => setMobileSidebarOpen(false)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
