import { create } from "zustand";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { axiosInstance, errorMessage } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { soundManager } from "../lib/soundManager";
import showNotification, {
  shouldNotifyInBackground,
} from "../lib/sharedMethod";
export interface ChatUser {
  _id: string;
  fullName: string;
  profilePicture?: string;
  lastSeen?: string;
  createdAt?: string;
  bannedUntil?: string | null;
  moderationStrikes?: number;
  email?: string;
  unreadCount?: number;
  lastMessage?: Message | null;
}
export interface Message {
  _id: string;
  senderId: string;
  receiverId: string;
  text: string;
  image?: string;
  audio?: string;
  audioDuration?: number;
  replyTo?: Message | null;
  createdAt: string;
  isRead?: boolean;
  isDelivered?: boolean;
  isDeleted?: boolean;
}
export interface Draft {
  text?: string;
  image?: string | null;
  audio?: string;
  audioDuration?: number;
  replyTo?: string | null;
}
interface ChatState {
  messages: Message[];
  users: ChatUser[];
  selectedUser: ChatUser | null;
  replyingTo: Message | null;
  isUsersLoading: boolean;
  isMessagesLoading: boolean;
  isSending: boolean;
  isSendingAudio: boolean;
  isTyping: boolean;
  shouldFocusInput: number;
  firstUnreadId: string | null;
  historyLoaded: boolean;
  getUsers: () => Promise<void>;
  getMessages: (id: string) => Promise<void>;
  sendMessage: (draft: Draft) => Promise<boolean>;
  deleteMessage: (id: string) => Promise<void>;
  setReplyingTo: (message: Message | null) => void;
  setSelectedUser: (user: ChatUser | null) => void;
  handleNewMessage: (message: Message) => void;
  handleConversationUpdated: (payload: {
    userId: string;
    lastMessage: Message;
  }) => void;
  handleDeleted: (id: string) => void;
  markSeen: (id: string, messageIds: string[]) => Promise<void>;
  markDelivered: (messageIds: string[]) => Promise<void>;
  applyReceipt: (messageIds: string[], read?: boolean) => void;
  emitStopTyping: () => void;
  onInputTyping: () => void;
}
let historyRequest = 0;
const reading = new Set<string>();
let typingTimer: ReturnType<typeof setTimeout> | undefined;
let typingExpiry: ReturnType<typeof setTimeout> | undefined;
export function receiveTyping(senderId: string, typing: boolean) {
  if (senderId !== useChatStore.getState().selectedUser?._id) return;
  clearTimeout(typingExpiry);
  useChatStore.setState({ isTyping: typing });
  if (typing)
    typingExpiry = setTimeout(
      () => useChatStore.setState({ isTyping: false }),
      2000,
    );
}
const append = (messages: Message[], message: Message) =>
  messages.some((m) => m._id === message._id)
    ? messages.map((m) =>
        m._id === message._id
          ? m.isDeleted
            ? m
            : {
                ...message,
                isRead: m.isRead || message.isRead,
                isDelivered:
                  m.isDelivered ||
                  message.isDelivered ||
                  m.isRead ||
                  message.isRead,
              }
          : m,
      )
    : [...messages, message];
const deleted = (m: Message): Message => ({
  ...m,
  text: "",
  image: "",
  audio: "",
  audioDuration: 0,
  replyTo: null,
  isDeleted: true,
});
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  replyingTo: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isSending: false,
  isSendingAudio: false,
  isTyping: false,
  shouldFocusInput: 0,
  firstUnreadId: null,
  historyLoaded: false,
  getUsers: async () => {
    if (get().isUsersLoading) return;
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      set({ isUsersLoading: false });
    }
  },
  getMessages: async (id) => {
    const request = ++historyRequest;
    if (!get().historyLoaded) set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get<Message[]>(`/messages/${id}`);
      if (get().selectedUser?._id !== id || request !== historyRequest) return;
      const me = useAuthStore.getState().authUser?._id;
      set((s) => {
        const messages = s.messages
          .reduce(append, res.data)
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        return {
          messages,
          historyLoaded: true,
          firstUnreadId: s.historyLoaded
            ? s.firstUnreadId
            : messages.find(
                (m) => m.receiverId === me && !m.isRead && !m.isDeleted,
              )?._id || null,
        };
      });
      void get().markDelivered(
        res.data
          .filter((m) => m.receiverId === me && !m.isDelivered && !m.isDeleted)
          .map((m) => m._id),
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (get().selectedUser?._id === id && request === historyRequest)
        set({ isMessagesLoading: false });
    }
  },
  applyReceipt: (ids, read = false) =>
    set((s) => {
      const update = (m: Message): Message =>
        ids.includes(m._id)
          ? { ...m, isDelivered: true, isRead: read || m.isRead }
          : m;
      return {
        messages: s.messages.map(update),
        users: s.users.map((u) =>
          u.lastMessage ? { ...u, lastMessage: update(u.lastMessage) } : u,
        ),
      };
    }),
  markDelivered: async (ids) => {
    for (let i = 0; i < ids.length; i += 100)
      try {
        const { data } = await axiosInstance.put("/messages/delivered", {
          messageIds: ids.slice(i, i + 100),
        });
        get().applyReceipt(data.messageIds);
      } catch {
        /* The next socket reconnect or history load retries delivery. */
      }
  },
  markSeen: async (id, ids) => {
    const pending = ids.filter((messageId) => !reading.has(messageId));
    if (!pending.length) return;
    pending.forEach((messageId) => reading.add(messageId));
    try {
      for (let i = 0; i < pending.length; i += 100) {
        const { data } = await axiosInstance.put(`/messages/seen/${id}`, {
          messageIds: pending.slice(i, i + 100),
        });
        get().applyReceipt(data.messageIds, true);
        set((s) => ({
          users: s.users.map((u) =>
            u._id === id ? { ...u, unreadCount: data.unreadCount } : u,
          ),
        }));
      }
    } catch {
      /* Visibility/focus changes and opening the chat retry read receipts. */
    } finally {
      pending.forEach((messageId) => reading.delete(messageId));
    }
  },
  sendMessage: async (draft) => {
    const { selectedUser, replyingTo, isSending, isSendingAudio } = get();
    if (!selectedUser || isSending || isSendingAudio) return false;
    const user = useAuthStore.getState().authUser;
    if (
      user?.bannedUntil &&
      new Date(user.bannedUntil).getTime() > Date.now()
    ) {
      toast.error("Your account is temporarily restricted.");
      return false;
    }
    const id = selectedUser._id;
    set(draft.audio ? { isSendingAudio: true } : { isSending: true });
    try {
      const { data } = await axiosInstance.post<
        Message & { moderationWarning?: string }
      >(`/messages/send/${id}`, {
        ...draft,
        replyTo:
          draft.replyTo === undefined ? replyingTo?._id || null : draft.replyTo,
      });
      set((s) => ({
        messages:
          s.selectedUser?._id === id ? append(s.messages, data) : s.messages,
        replyingTo: s.selectedUser?._id === id ? null : s.replyingTo,
      }));
      get().handleConversationUpdated({ userId: id, lastMessage: data });
      get().emitStopTyping();
      if (data.moderationWarning)
        toast(data.moderationWarning, {
          id: "moderation-quota",
          icon: "⚠️",
          duration: 6000,
        });
      return true;
    } catch (e) {
      if (isAxiosError(e) && e.response?.data?.bannedUntil)
        useAuthStore.setState((s) => ({
          authUser: s.authUser
            ? { ...s.authUser, bannedUntil: e.response?.data.bannedUntil }
            : null,
        }));
      toast.error(errorMessage(e));
      return false;
    } finally {
      set({ isSending: false, isSendingAudio: false });
    }
  },
  deleteMessage: async (id) => {
    try {
      await axiosInstance.delete(`/messages/${id}`);
      get().handleDeleted(id);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  },
  handleDeleted: (id) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m._id === id
          ? deleted(m)
          : m.replyTo?._id === id
            ? { ...m, replyTo: deleted(m.replyTo) }
            : m,
      ),
      replyingTo: s.replyingTo?._id === id ? null : s.replyingTo,
      users: s.users.map((u) =>
        u.lastMessage?._id === id
          ? { ...u, lastMessage: deleted(u.lastMessage) }
          : u,
      ),
    })),
  handleNewMessage: (message) => {
    const me = useAuthStore.getState().authUser?._id;
    const other =
      message.senderId === me ? message.receiverId : message.senderId;
    if (get().selectedUser?._id === other) {
      set((s) => ({ messages: append(s.messages, message) }));
    }
  },
  handleConversationUpdated: ({ userId, lastMessage }) => {
    const mine = lastMessage.senderId === useAuthStore.getState().authUser?._id;
    const old = get().users.find((u) => u._id === userId);
    if (!old) {
      void get().getUsers();
      return;
    }
    const duplicate = old.lastMessage?._id === lastMessage._id;
    set((s) => ({
      users: [
        {
          ...old,
          lastMessage:
            duplicate && old.lastMessage
              ? {
                  ...lastMessage,
                  isRead: old.lastMessage.isRead || lastMessage.isRead,
                  isDelivered:
                    old.lastMessage.isDelivered || lastMessage.isDelivered,
                }
              : lastMessage,
          unreadCount: mine
            ? 0
            : duplicate
              ? old.unreadCount
              : (old.unreadCount || 0) +
                (lastMessage.isRead || lastMessage.isDeleted ? 0 : 1),
        },
        ...s.users.filter((u) => u._id !== userId),
      ],
    }));
    if (!mine && !duplicate && shouldNotifyInBackground()) {
      soundManager.playNotify();
      showNotification(
        "New message",
        lastMessage.text || (lastMessage.image ? "Photo" : "Voice message"),
      );
    }
  },
  setReplyingTo: (message) =>
    set((s) => ({
      replyingTo: message,
      shouldFocusInput: s.shouldFocusInput + 1,
    })),
  setSelectedUser: (user) => {
    if (user && user._id === get().selectedUser?._id) return;
    historyRequest++;
    get().emitStopTyping();
    clearTimeout(typingExpiry);
    set((s) => ({
      selectedUser: user,
      messages: [],
      firstUnreadId: null,
      historyLoaded: false,
      isMessagesLoading: false,
      replyingTo: null,
      isTyping: false,
      shouldFocusInput: s.shouldFocusInput + 1,
    }));
  },
  emitStopTyping: () => {
    clearTimeout(typingTimer);
    const id = get().selectedUser?._id;
    if (id)
      useAuthStore.getState().socket?.emit("stopTyping", { receiverId: id });
  },
  onInputTyping: () => {
    const id = get().selectedUser?._id;
    if (!id) return;
    useAuthStore.getState().socket?.emit("typing", { receiverId: id });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => get().emitStopTyping(), 900);
  },
}));
