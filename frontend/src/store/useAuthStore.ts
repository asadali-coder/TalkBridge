import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import toast from "react-hot-toast";
import { axiosInstance, errorMessage } from "../lib/axios";
import {
  useChatStore,
  receiveTyping,
  type ChatUser,
  type Message,
} from "./useChatStore";
interface Credentials {
  email: string;
  password: string;
  fullName?: string;
}
interface AuthState {
  authUser: ChatUser | null;
  isSigningUp: boolean;
  isLoggingIn: boolean;
  isUpdatingProfile: boolean;
  isCheckingAuth: boolean;
  onlineUsers: string[];
  socket: Socket | null;
  checkAuth: () => Promise<void>;
  signUp: (data: Credentials) => Promise<void>;
  login: (data: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: FormData) => Promise<boolean>;
  connectSocket: () => void;
  disconnectSocket: () => void;
}
export const useAuthStore = create<AuthState>((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,
  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket();
    } catch {
      get().disconnectSocket();
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },
  signUp: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });
      get().connectSocket();
      toast.success("Account created");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      set({ isSigningUp: false });
    }
  },
  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });
      get().connectSocket();
      toast.success("Logged in");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      set({ isLoggingIn: false });
    }
  },
  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      get().disconnectSocket();
      set({ authUser: null });
      useChatStore.getState().setSelectedUser(null);
      useChatStore.setState({ users: [] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  },
  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated");
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      set({ isUpdatingProfile: false });
    }
  },
  connectSocket: () => {
    if (!get().authUser || get().socket) return;
    const socket = io(
      import.meta.env.VITE_SOCKET_BASE_URL || window.location.origin,
      { withCredentials: true },
    );
    set({ socket });
    socket.on("getOnlineUsers", (onlineUsers: string[]) =>
      set({ onlineUsers }),
    );
    socket.on("connect", () => {
      void get().checkAuth();
      const chat = useChatStore.getState();
      void chat.getUsers();
      if (chat.selectedUser) void chat.getMessages(chat.selectedUser._id);
    });
    socket.on("newMessage", (message: Message) => {
      const chat = useChatStore.getState();
      chat.handleNewMessage(message);
      if (message.receiverId === get().authUser?._id)
        void chat.markDelivered([message._id]);
    });
    socket.on("pendingMessages", (messages: Message[]) => {
      const chat = useChatStore.getState();
      messages.forEach((message) => chat.handleNewMessage(message));
      void chat.markDelivered(messages.map((message) => message._id));
    });
    socket.on("messagesDelivered", ({ messageIds }: { messageIds: string[] }) =>
      useChatStore.getState().applyReceipt(messageIds),
    );
    socket.on("conversationUpdated", (payload) =>
      useChatStore.getState().handleConversationUpdated(payload),
    );
    socket.on(
      "messageDeleted",
      ({
        messageId,
        senderId,
        receiverId,
        unreadCount,
      }: {
        messageId: string;
        senderId: string;
        receiverId: string;
        unreadCount: number;
      }) => {
        useChatStore.getState().handleDeleted(messageId);
        if (receiverId === get().authUser?._id)
          useChatStore.setState((s) => ({
            users: s.users.map((u) =>
              u._id === senderId ? { ...u, unreadCount } : u,
            ),
          }));
      },
    );
    socket.on("typing", ({ senderId }) => receiveTyping(senderId, true));
    socket.on("stopTyping", ({ senderId }) => receiveTyping(senderId, false));
    socket.on("messagesSeen", ({ messageIds }: { messageIds: string[] }) =>
      useChatStore.getState().applyReceipt(messageIds, true),
    );
    socket.on(
      "conversationSeen",
      ({
        userId,
        messageIds,
        unreadCount,
      }: {
        userId: string;
        messageIds: string[];
        unreadCount: number;
      }) => {
        useChatStore.getState().applyReceipt(messageIds, true);
        useChatStore.setState((s) => ({
          users: s.users.map((u) =>
            u._id === userId ? { ...u, unreadCount } : u,
          ),
        }));
      },
    );
    socket.on("userStatusChange", ({ userId, lastSeen }) =>
      useChatStore.setState((s) => ({
        users: s.users.map((u) =>
          u._id === userId ? { ...u, lastSeen: lastSeen || u.lastSeen } : u,
        ),
        selectedUser:
          s.selectedUser?._id === userId
            ? {
                ...s.selectedUser,
                lastSeen: lastSeen || s.selectedUser.lastSeen,
              }
            : s.selectedUser,
      })),
    );
    socket.on("moderationUpdated", ({ bannedUntil, moderationStrikes }) =>
      set((s) => ({
        authUser: s.authUser
          ? { ...s.authUser, bannedUntil, moderationStrikes }
          : null,
      })),
    );
  },
  disconnectSocket: () => {
    get().socket?.disconnect();
    set({ socket: null, onlineUsers: [] });
  },
}));
