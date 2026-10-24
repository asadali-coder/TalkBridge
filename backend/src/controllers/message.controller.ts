import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { io, userRoom } from "../libs/socket.js";
import { moderate } from "../services/moderation.service.js";
import {
  HttpError,
  parseMedia,
  uploadMedia,
} from "../services/media.service.js";
import cloudinary from "../libs/cloudinary.js";
const replyFields = "text image audio senderId createdAt isDeleted";
const conversation = (a: unknown, b: unknown) => ({
  $or: [
    { senderId: a, receiverId: b },
    { senderId: b, receiverId: a },
  ],
});
function validId(value: unknown) {
  if (typeof value !== "string" || !isValidObjectId(value))
    throw new HttpError(400, "Invalid ID");
  return value;
}
export const getUsersForSidebar: RequestHandler = async (req, res) => {
  const me = req.user._id;
  const users = await User.find({ _id: { $ne: me } }).select(
    "fullName profilePicture lastSeen createdAt",
  );
  const rows = await Promise.all(
    users.map(async (u) => ({
      ...u.toObject(),
      unreadCount: await Message.countDocuments({
        senderId: u._id,
        receiverId: me,
        isRead: { $ne: true },
        isDeleted: { $ne: true },
      }),
      lastMessage: await Message.findOne(conversation(me, u._id)).sort({
        createdAt: -1,
      }),
    })),
  );
  rows.sort(
    (a, b) =>
      (b.lastMessage?.createdAt?.getTime() || 0) -
      (a.lastMessage?.createdAt?.getTime() || 0),
  );
  res.json(rows);
};
function receiptIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some((id) => typeof id !== "string" || !isValidObjectId(id))
  )
    throw new HttpError(400, "Provide up to 200 valid message IDs");
  return [...new Set(value)];
}
export const markDelivered: RequestHandler = async (req, res) => {
  const ids = receiptIds(req.body?.messageIds);
  const messages = await Message.find({
    _id: { $in: ids },
    receiverId: req.user._id,
    isDelivered: { $ne: true },
    isDeleted: { $ne: true },
  }).select("_id senderId");
  await Message.updateMany(
    { _id: { $in: messages.map((m) => m._id) }, receiverId: req.user._id },
    { $set: { isDelivered: true } },
  );
  const senders = new Set(messages.map((m) => String(m.senderId)));
  for (const senderId of senders) {
    const messageIds = messages
      .filter((m) => String(m.senderId) === senderId)
      .map((m) => String(m._id));
    io.to(userRoom(senderId)).emit("messagesDelivered", { messageIds });
  }
  const messageIds = messages.map((m) => String(m._id));
  io.to(userRoom(req.user._id)).emit("messagesDelivered", { messageIds });
  res.json({ messageIds });
};
export const markSeen: RequestHandler = async (req, res) => {
  const id = validId(req.params.id);
  const me = req.user._id;
  // Keep empty-body support for older clients; updated clients send visible IDs.
  const ids =
    req.body?.messageIds === undefined
      ? undefined
      : receiptIds(req.body.messageIds);
  const unread = await Message.find({
    senderId: id,
    receiverId: me,
    isRead: { $ne: true },
    isDeleted: { $ne: true },
    ...(ids ? { _id: { $in: ids } } : {}),
  }).select("_id");
  const messageIds = unread.map((m) => String(m._id));
  await Message.updateMany(
    { _id: { $in: messageIds }, receiverId: me },
    { $set: { isRead: true, isDelivered: true } },
  );
  const unreadCount = await Message.countDocuments({
    senderId: id,
    receiverId: me,
    isRead: { $ne: true },
    isDeleted: { $ne: true },
  });
  io.to(userRoom(id)).emit("messagesSeen", {
    receiverId: String(me),
    messageIds,
  });
  io.to(userRoom(me)).emit("conversationSeen", {
    userId: id,
    messageIds,
    unreadCount,
  });
  res.json({ messageIds, unreadCount });
};
export const getMessages: RequestHandler = async (req, res) => {
  const id = validId(req.params.id);
  res.json(
    await Message.find(conversation(req.user._id, id))
      .sort({ createdAt: 1 })
      .populate("replyTo", replyFields),
  );
};
// Serialize sends from the same account, including requests from other tabs.
// A violation completes its ban before that account's next send is evaluated.
const pendingSends = new Map<string, Promise<void>>();
export const sendMessage: RequestHandler = async (req, res, next) => {
  const id = String(req.user._id),
    previous = pendingSends.get(id) || Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingSends.set(id, turn);
  await previous;
  try {
    await sendForAccount(req, res, next);
  } finally {
    release();
    if (pendingSends.get(id) === turn) pendingSends.delete(id);
  }
};
const sendForAccount: RequestHandler = async (req, res) => {
  const receiverId = validId(req.params.id);
  const senderId = req.user._id;
  if (
    receiverId === String(senderId) ||
    !(await User.exists({ _id: receiverId }))
  )
    throw new HttpError(404, "Recipient not found");
  const sender = await User.findById(senderId);
  if (!sender) throw new HttpError(401, "Please log in");
  if (sender.bannedUntil && sender.bannedUntil.getTime() > Date.now()) {
    res.status(403).json({
      code: "BANNED",
      message:
        "You are blocked from sending messages until the 24-hour restriction expires.",
      bannedUntil: sender.bannedUntil,
    });
    return;
  }
  const body = req.body || {};
  if (body.text != null && typeof body.text !== "string")
    throw new HttpError(400, "Invalid text");
  const text = (body.text || "").trim();
  const image = body.image || undefined;
  const audio = body.audio || undefined;
  if (!text && !image && !audio)
    throw new HttpError(400, "Message must contain text, image or audio");
  if (text.length > 5000 || (image && audio))
    throw new HttpError(400, "Use up to 5000 characters and one attachment");
  if (image) parseMedia(image, "image");
  if (audio) parseMedia(audio, "audio");
  const duration = Number(body.audioDuration || 0);
  if (!Number.isFinite(duration) || duration < 0 || duration > 120)
    throw new HttpError(400, "Invalid voice duration");
  let replyTo: string | null = null;
  if (body.replyTo) {
    replyTo = validId(body.replyTo);
    if (
      !(await Message.exists({
        _id: replyTo,
        ...conversation(senderId, receiverId),
        isDeleted: { $ne: true },
      }))
    )
      throw new HttpError(400, "Reply message is unavailable");
  }
  let moderationWarning: string | undefined;
  const blocked = await moderate(text, image, audio, () => {
    moderationWarning =
      "AI moderation limit reached. Your message was sent with limited moderation.";
  });
  if (blocked) {
    const updated = await User.findByIdAndUpdate(
      senderId,
      {
        $set: { bannedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        $inc: { moderationStrikes: 1 },
      },
      { new: true },
    );
    const payload = {
      code: "BANNED",
      message:
        "You are blocked from messaging for 24 hours because vulgar or abusive content was detected.",
      moderationStrikes: updated?.moderationStrikes,
      bannedUntil: updated?.bannedUntil,
    };
    io.to(userRoom(senderId)).emit("moderationUpdated", payload);
    res.status(403).json(payload);
    return;
  }
  const uploaded = image
    ? await uploadMedia(image, "image")
    : audio
      ? await uploadMedia(audio, "audio")
      : null;
  try {
    const message = await Message.create({
      senderId,
      receiverId,
      text,
      image: image ? uploaded?.url : "",
      audio: audio ? uploaded?.url : "",
      audioDuration: audio ? duration : 0,
      replyTo,
      mediaPublicId: uploaded?.publicId,
      mediaResourceType: uploaded?.resourceType,
    });
    await message.populate("replyTo", replyFields);
    const {
      mediaPublicId: _publicId,
      mediaResourceType: _resourceType,
      ...safe
    } = message.toObject();
    io.to(userRoom(receiverId)).to(userRoom(senderId)).emit("newMessage", safe);
    io.to(userRoom(receiverId)).emit("conversationUpdated", {
      userId: String(senderId),
      lastMessage: safe,
    });
    io.to(userRoom(senderId)).emit("conversationUpdated", {
      userId: receiverId,
      lastMessage: safe,
    });
    res
      .status(201)
      .json({ ...safe, ...(moderationWarning ? { moderationWarning } : {}) });
  } catch (error) {
    if (uploaded)
      await cloudinary.uploader
        .destroy(uploaded.publicId, { resource_type: uploaded.resourceType })
        .catch(console.error);
    throw error;
  }
};
export const deleteMessage: RequestHandler = async (req, res) => {
  const id = validId(req.params.id);
  const message = await Message.findOne({
    _id: id,
    senderId: req.user._id,
  }).select("+mediaPublicId +mediaResourceType");
  if (!message)
    throw new HttpError(404, "Message not found or you are not its sender");
  const mediaPublicId = message.mediaPublicId;
  const mediaResourceType = message.mediaResourceType;
  message.mediaPublicId = "";
  message.mediaResourceType = undefined;
  message.text = "";
  message.image = "";
  message.audio = "";
  message.audioDuration = 0;
  message.replyTo = null;
  message.isDeleted = true;
  await message.save();
  const unreadCount = await Message.countDocuments({
    senderId: message.senderId,
    receiverId: message.receiverId,
    isRead: { $ne: true },
    isDeleted: { $ne: true },
  });
  io.to(userRoom(message.senderId))
    .to(userRoom(message.receiverId))
    .emit("messageDeleted", {
      messageId: id,
      senderId: String(message.senderId),
      receiverId: String(message.receiverId),
      unreadCount,
    });
  if (mediaPublicId)
    await cloudinary.uploader
      .destroy(mediaPublicId, { resource_type: mediaResourceType || "image" })
      .catch((error) => console.error("Media cleanup failed:", error.message));
  const {
    mediaPublicId: _publicId,
    mediaResourceType: _resourceType,
    ...safe
  } = message.toObject();
  res.json(safe);
};
