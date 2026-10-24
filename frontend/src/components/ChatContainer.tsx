import { useChatStore } from "../store/useChatStore";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";
import MessageStatus from "./MessageStatus";
import MessageInput from "./MessageInput";
import ChatHeader from "./ChatHeader";
import { isUserBanned } from "../lib/sharedMethod";
const ChatContainer = ({
  readingEnabled = true,
}: {
  readingEnabled?: boolean;
}) => {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    deleteMessage,
    firstUnreadId,
    historyLoaded,
    markSeen,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const banned = isUserBanned(authUser);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const positioned = useRef(false);
  const nearBottom = useRef(true);
  const lastPositionedId = useRef<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const lastMessage = messages.at(-1);
  const unreadCount = messages.filter(
    (message) =>
      message.receiverId === authUser._id &&
      !message.isRead &&
      !message.isDeleted,
  ).length;

  useEffect(() => {
    void getMessages(selectedUser._id);
  }, [selectedUser._id, getMessages]);
  useLayoutEffect(() => {
    const root = viewportRef.current;
    if (!root || isMessagesLoading || !historyLoaded) return;
    if (!positioned.current) {
      const anchor = firstUnreadId
        ? document.getElementById(`unread-${firstUnreadId}`)
        : null;
      if (anchor)
        root.scrollTop +=
          anchor.getBoundingClientRect().top -
          root.getBoundingClientRect().top -
          12;
      else root.scrollTop = root.scrollHeight;
      nearBottom.current =
        root.scrollHeight - root.scrollTop - root.clientHeight < 80;
      positioned.current = true;
    } else if (
      lastPositionedId.current !== lastMessage?._id &&
      (nearBottom.current || lastMessage?.senderId === authUser._id)
    ) {
      root.scrollTop = root.scrollHeight;
    }
    lastPositionedId.current = lastMessage?._id || null;
  }, [
    historyLoaded,
    isMessagesLoading,
    firstUnreadId,
    lastMessage?._id,
    lastMessage?.senderId,
    authUser._id,
  ]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root || isMessagesLoading || !historyLoaded) return;
    const visible = new Set<string>();
    let timer: ReturnType<typeof setTimeout>;
    const flush = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (
          !readingEnabled ||
          document.visibilityState !== "visible" ||
          !document.hasFocus() ||
          useChatStore.getState().selectedUser?._id !== selectedUser._id
        )
          return;
        const current = useChatStore.getState().messages;
        const lastVisible = current.reduce(
          (last, message, index) => (visible.has(message._id) ? index : last),
          -1,
        );
        // A conversation is read through the latest visible message, like chat apps.
        const ids = current
          .slice(0, lastVisible + 1)
          .filter(
            (message) =>
              message.receiverId === authUser._id &&
              !message.isRead &&
              !message.isDeleted,
          )
          .map((message) => message._id);
        if (ids.length) void markSeen(selectedUser._id, ids);
      }, 80);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          if (
            entry.isIntersecting &&
            (entry.intersectionRatio >= 0.25 ||
              entry.intersectionRect.height >= 80)
          )
            visible.add(id);
          else visible.delete(id);
        }
        flush();
      },
      { root, threshold: [0, 0.01, 0.1, 0.25, 0.5, 1] },
    );
    root
      .querySelectorAll("[data-message-id]")
      .forEach((node) => observer.observe(node));
    window.addEventListener("focus", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("focus", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [
    messages,
    historyLoaded,
    isMessagesLoading,
    selectedUser._id,
    authUser._id,
    markSeen,
    readingEnabled,
  ]);

  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("msg-highlight");
    setTimeout(() => el.classList.remove("msg-highlight"), 1200);
  };

  const linkify = (text = "") => {
    const urlRegex = /(https?:\/\/[^\s]+?)(?=https?:\/\/|\s|$)/g;

    const parts = text.split(urlRegex);

    return parts.map((part, i) => {
      if (!part) return null;

      // Use a NON-global regex here to avoid the `.test()` + /g bug
      const isUrl = /^https?:\/\/\S+$/i.test(part);

      if (!isUrl) return <span key={i}>{part}</span>;

      // Optional: remove trailing punctuation like ., ) , ]
      const cleaned = part.replace(/[),.\]]+$/g, "");

      return (
        <a
          key={i}
          href={cleaned}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline break-words"
        >
          {cleaned}
        </a>
      );
    });
  };

  if (isMessagesLoading) {
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput key={selectedUser._id} />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <ChatHeader />

      <div className="relative flex-1 min-h-0">
        <div
          ref={viewportRef}
          data-testid="message-viewport"
          onScroll={(event) => {
            const root = event.currentTarget;
            const bottom =
              root.scrollHeight - root.scrollTop - root.clientHeight < 80;
            nearBottom.current = bottom;
            setAtBottom(bottom);
          }}
          className="h-full overflow-y-auto overscroll-contain p-4 space-y-4"
        >
          {messages?.map((message) => (
            <Fragment key={message._id}>
              {message._id === firstUnreadId && (
                <div
                  id={`unread-${message._id}`}
                  data-testid="unread-divider"
                  className="flex items-center gap-3 py-2 text-xs font-medium text-base-content/60"
                >
                  <span className="h-px flex-1 bg-base-300" />
                  <span className="shrink-0 rounded-full border border-base-300 bg-base-100 px-3 py-1">
                    Unread messages
                  </span>
                  <span className="h-px flex-1 bg-base-300" />
                </div>
              )}
              <div
                id={`msg-${message._id}`}
                data-message-id={message._id}
                className={`chat ${
                  message.senderId === authUser._id ? "chat-end" : "chat-start"
                }`}
              >
                <div className="chat-image avatar">
                  <div className="size-10 rounded-full border">
                    <img
                      src={
                        message.senderId === authUser._id
                          ? authUser.profilePicture || "/avatar.png"
                          : selectedUser.profilePicture || "/avatar.png"
                      }
                      alt="profile pic"
                    />
                  </div>
                </div>

                <div className="chat-header mb-1">
                  <time className="text-xs opacity-50 ml-1">
                    {formatMessageTime(message.createdAt)}
                  </time>
                </div>

                <div
                  className={`chat-bubble group ${
                    message.senderId === authUser._id
                      ? "bg-primary text-primary-content"
                      : "bg-base-200 text-base-content"
                  }`}
                >
                  {message.isDeleted && (
                    <p className="italic opacity-60">Message deleted</p>
                  )}
                  {/* REPLY PREVIEW */}
                  {message.replyTo && (
                    <div
                      onClick={() => jumpToMessage(message.replyTo._id)}
                      className="mb-1 px-3 py-2 rounded-md bg-zinc-800/80 border-l-4 border-blue-500 cursor-pointer hover:bg-zinc-800 transition"
                    >
                      <p className="text-xs text-blue-400 font-medium mb-0.5">
                        Replying to{" "}
                        {message.replyTo.senderId === authUser._id
                          ? "You"
                          : selectedUser.fullName}
                      </p>

                      <p className="text-sm text-zinc-300 truncate">
                        {message.replyTo.isDeleted
                          ? "Message deleted"
                          : message.replyTo.text ||
                            (message.replyTo.image && "📷 Photo") ||
                            (message.replyTo.audio && "🎵 Audio")}
                      </p>
                    </div>
                  )}

                  {/* IMAGE MESSAGE */}
                  {message.image && (
                    <img
                      src={message.image}
                      alt="Attachment"
                      onLoad={() => {
                        const root = viewportRef.current;
                        if (root && nearBottom.current)
                          root.scrollTop = root.scrollHeight;
                      }}
                      className="max-w-full sm:max-w-[200px] rounded-md mb-2"
                    />
                  )}

                  {/* AUDIO MESSAGE */}
                  {message.audio && (
                    <div className="flex items-center gap-3 bg-black/20 px-3 py-2 rounded-lg mb-1">
                      <audio controls className="w-40">
                        <source src={message.audio} />
                        Your browser does not support audio playback.
                      </audio>
                      {message.audioDuration && (
                        <span className="text-xs opacity-70">
                          {Math.round(message.audioDuration)}s
                        </span>
                      )}
                    </div>
                  )}

                  {/* TEXT MESSAGE */}
                  {message.text && (
                    <p className="whitespace-pre-wrap">
                      {linkify(message.text)}
                    </p>
                  )}

                  {/* REPLY BUTTON */}
                  <button
                    disabled={banned || message.isDeleted}
                    className="text-xs underline mt-2 mr-3 cursor-pointer disabled:opacity-40"
                    onClick={() =>
                      useChatStore.getState().setReplyingTo(message)
                    }
                  >
                    Reply
                  </button>
                  {message.senderId === authUser._id && !message.isDeleted && (
                    <button
                      className="text-xs underline cursor-pointer"
                      onClick={() => {
                        if (window.confirm("Delete this message for everyone?"))
                          void deleteMessage(message._id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {message.senderId === authUser._id && !message.isDeleted && (
                    <div className="flex justify-end mt-1">
                      <MessageStatus message={message} />
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
        {!atBottom && (
          <button
            type="button"
            aria-label="Jump to latest messages"
            className="absolute bottom-3 right-3 rounded-full bg-base-100 border border-base-300 shadow-lg px-3 py-2 text-sm"
            onClick={() => {
              const root = viewportRef.current;
              if (root)
                root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
            }}
          >
            ↓ {unreadCount > 0 ? unreadCount : "Latest"}
          </button>
        )}
      </div>

      <MessageInput key={selectedUser._id} />
    </div>
  );
};

export default ChatContainer;
