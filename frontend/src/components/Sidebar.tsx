import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import MessageStatus from "./MessageStatus";
import { Users } from "lucide-react";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
function sidebarTime(value: string) {
  const date = new Date(value),
    today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "2-digit", month: "short" });
}
const Sidebar = ({ onSelectUser }: { onSelectUser?: () => void }) => {
  const { getUsers, users, selectedUser, setSelectedUser, isUsersLoading } =
    useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  const filteredUsers = showOnlineOnly
    ? users.filter((user) => onlineUsers.includes(user._id))
    : users;

  if (isUsersLoading) return <SidebarSkeleton />;
  const onSelectedUser = (user: (typeof users)[number]) => {
    setSelectedUser(user);
    onSelectUser?.();
  };
  return (
    <aside className="h-full w-full lg:w-72 border-r border-base-300 flex flex-col transition-all duration-200">
      <div className="border-b border-base-300 w-full p-5">
        <div className="flex items-center gap-2">
          <Users className="size-6" />
          <span className="font-medium hidden lg:block">Contacts</span>
        </div>

        {/* Online Filter */}
        <div className="mt-3 hidden lg:flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Show online only</span>
          </label>
          <span className="text-xs text-zinc-500">
            ({Math.max(0, onlineUsers.length - 1)} online)
          </span>
        </div>
      </div>

      <div className="overflow-y-auto w-full py-3">
        {filteredUsers.map((user: (typeof users)[number]) => (
          <button
            key={user._id}
            onClick={() => onSelectedUser(user)}
            className={`
              w-full p-3 flex items-center gap-3
              hover:bg-base-300 transition-colors
              ${selectedUser?._id === user._id ? "bg-base-300 ring-1 ring-base-300" : ""}
            `}
          >
            <div className="relative shrink-0">
              <img
                src={user.profilePicture || "/avatar.png"}
                alt={user.fullName}
                className="size-12 object-cover rounded-full"
              />
              {onlineUsers.includes(user._id) && (
                <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-900" />
              )}
            </div>

            {/* Desktop View: Name + Last Message Preview */}
            <div className=" lg:block text-left min-w-0 flex-1">
              <div className="flex justify-between items-center gap-2 mb-1">
                <div className="font-medium truncate min-w-0">
                  {user.fullName}
                </div>
                <div className="text-[11px] text-zinc-400 shrink-0">
                  {user.lastMessage
                    ? sidebarTime(user.lastMessage.createdAt)
                    : ""}
                </div>
              </div>

              <div className="flex items-center gap-2 min-w-0 text-sm text-base-content/60">
                {user.lastMessage?.senderId === authUser?._id &&
                  !user.lastMessage?.isDeleted && (
                    <MessageStatus message={user.lastMessage} />
                  )}
                <span className="block min-w-0 flex-1 truncate">
                  {!user.lastMessage
                    ? "No messages yet"
                    : user.lastMessage.isDeleted
                      ? "Message deleted"
                      : user.lastMessage.text ||
                        (user.lastMessage.image ? "📷 Photo" : "🎤 Voice")}
                </span>
                {(user.unreadCount || 0) > 0 && (
                  <span
                    data-testid={`unread-count-${user._id}`}
                    aria-label={`${user.unreadCount} unread messages`}
                    className="inline-flex shrink-0 min-w-6 h-6 px-1.5 items-center justify-center rounded-full bg-emerald-500 text-white font-semibold text-xs"
                  >
                    {user.unreadCount > 99 ? "99+" : user.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}

        {filteredUsers.length === 0 && (
          <div className="text-center text-zinc-500 py-4">No users found</div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
