import { Server } from "socket.io";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { origins, secret } from "./config.js";
export const app = express();
export const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: origins, credentials: true },
  allowRequest: (req, done) =>
    done(null, !req.headers.origin || origins.includes(req.headers.origin)),
});
export const userRoom = (id: unknown) => `user:${String(id)}`;
const connections = new Map<string, Set<string>>();
io.use(async (socket, next) => {
  try {
    const cookies = cookieParser.JSONCookies(
      Object.fromEntries(
        (socket.handshake.headers.cookie || "")
          .split(";")
          .filter((s) => s.includes("="))
          .map((s) => {
            const i = s.indexOf("=");
            return [s.slice(0, i).trim(), decodeURIComponent(s.slice(i + 1))];
          }),
      ),
    );
    const decoded = jwt.verify(
      typeof cookies.jwt === "string" ? cookies.jwt : "",
      secret(),
    );
    if (
      typeof decoded === "string" ||
      typeof decoded.userId !== "string" ||
      !(await User.exists({ _id: decoded.userId }))
    )
      throw new Error();
    socket.data.userId = decoded.userId;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});
io.on("connection", (socket) => {
  const userId: string = socket.data.userId;
  socket.join(userRoom(userId));
  const ids = connections.get(userId) || new Set<string>();
  ids.add(socket.id);
  connections.set(userId, ids);
  void User.findByIdAndUpdate(userId, { isOnline: true })
    .exec()
    .catch(console.error);
  io.emit("getOnlineUsers", [...connections.keys()]);
  io.emit("userStatusChange", { userId, isOnline: true });
  // Send offline backlog to the actual recipient; the browser acknowledges delivery.
  void Message.find({
    receiverId: userId,
    isDelivered: { $ne: true },
    isRead: { $ne: true },
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .populate("replyTo", "text image audio senderId createdAt isDeleted")
    .then((messages) => {
      if (socket.connected && messages.length)
        socket.emit("pendingMessages", messages);
    })
    .catch(console.error);
  for (const event of ["typing", "stopTyping"])
    socket.on(event, (payload: { receiverId?: string } = {}) => {
      if (
        typeof payload?.receiverId === "string" &&
        /^[a-f0-9]{24}$/i.test(payload.receiverId)
      )
        io.to(userRoom(payload.receiverId)).emit(event, { senderId: userId });
    });
  socket.on("disconnect", () => {
    ids.delete(socket.id);
    if (ids.size) return;
    connections.delete(userId);
    const lastSeen = new Date();
    void User.findByIdAndUpdate(userId, { isOnline: false, lastSeen })
      .exec()
      .catch(console.error);
    io.emit("getOnlineUsers", [...connections.keys()]);
    io.emit("userStatusChange", { userId, isOnline: false, lastSeen });
  });
});
