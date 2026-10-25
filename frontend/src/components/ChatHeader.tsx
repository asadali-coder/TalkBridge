import { X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { formatMessageTime } from "../lib/utils";
import { isUserBanned } from "../lib/sharedMethod";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser, isTyping } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();

  const isOnline = onlineUsers && onlineUsers.includes(selectedUser._id);
  const banned = isUserBanned(authUser);

  return (
    <div className="shrink-0 p-2.5 border-b border-base-300 bg-base-100">
      <div className="flex items-center justify-between">
        {/* LEFT SIDE */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar">
            <div className="size-10 rounded-full">
              <img
                src={selectedUser.profilePicture || "/avatar.png"}
                alt={selectedUser.fullName}
              />
            </div>
          </div>

          {/* Name + Status */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="font-medium leading-tight">
                {selectedUser.fullName}
              </h3>

              {/*  RESTRICTED BADGE (BEST PLACE) */}
              {banned && (
                <span
                  title="Your account is temporarily restricted"
                  className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                  Sending blocked
                </span>
              )}
            </div>

            {/* Status line */}
            {isTyping ? (
              <span className="text-primary text-sm font-medium animate-pulse">
                Typing…
              </span>
            ) : isOnline ? (
              <span className="text-green-500 text-sm font-medium">Online</span>
            ) : (
              <span className="text-zinc-500 text-sm">
                {selectedUser?.lastSeen
                  ? `Last seen ${formatMessageTime(selectedUser.lastSeen)}`
                  : "Offline"}
              </span>
            )}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <button
          className="cursor-pointer opacity-70 hover:opacity-100 transition"
          onClick={() => setSelectedUser(null)}>
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
