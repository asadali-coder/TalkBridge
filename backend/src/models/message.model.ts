import mongoose, { Schema, model } from "mongoose";

const messageSchema = new Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    text: { type: String, default: "" },

    image: { type: String, default: "" },
    audio: { type: String, default: "" },
    audioDuration: { type: Number, default: 0 },

    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },

    mediaPublicId: { type: String, default: "", select: false },
    mediaResourceType: {
      type: String,
      enum: ["image", "video"],
      select: false,
    },
    isDeleted: { type: Boolean, default: false },
    isDelivered: { type: Boolean, default: false },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// fast “conversation messages” fetch
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: 1 });

export default model("Message", messageSchema);
