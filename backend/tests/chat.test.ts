import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as client, type Socket } from "socket.io-client";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-that-never-leaves-the-test";
process.env.GEMINI_API_KEY = "";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DOTENV_CONFIG_PATH = "/dev/null";
const { app, server } = await import("../src/index.js");
const { containsProfanity } =
  await import("../src/services/moderation.service.js");
const { parseMedia } = await import("../src/services/media.service.js");
const { default: User } = await import("../src/models/user.model.js");
const { default: cloudinary } = await import("../src/libs/cloudinary.js");
let mongo: MongoMemoryServer;
let base: string;
const sockets: Socket[] = [];
interface Session {
  id: string;
  cookie: string;
}
let alice: Session, bob: Session, eve: Session;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  session?: Session,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
async function signup(name: string) {
  const r = await request("/api/auth/signup", "POST", {
    fullName: name,
    email: `${name}@example.com`,
    password: "password123",
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.password, undefined);
  return { id: r.data._id, cookie: r.cookie };
}
async function connect(session: Session) {
  const socket = client(base, {
    extraHeaders: { Cookie: session.cookie },
    transports: ["websocket"],
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}
function once(socket: Socket, event: string) {
  return new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Missing ${event}`)), 3000);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}
before(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { args: ["--nounixsocket"] },
  });
  await mongoose.connect(mongo.getUri());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  alice = await signup("alice");
  bob = await signup("bob");
  eve = await signup("eve");
});
after(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Allow presence writes triggered by socket disconnects to finish before closing MongoDB.
  const deadline = Date.now() + 2000;
  while (
    (await User.countDocuments({ isOnline: true })) &&
    Date.now() < deadline
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  await mongoose.disconnect();
  await mongo?.stop();
});
test("auth, normalized email, safe profile response and invalid IDs", async () => {
  assert.equal((await request("/api/messages/users")).status, 401);
  assert.equal(
    (
      await request("/api/auth/login", "POST", {
        email: " ALICE@EXAMPLE.COM ",
        password: "password123",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/auth/login", "POST", {
        email: "alice@example.com",
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/api/messages/not-an-id", "GET", undefined, alice)).status,
    400,
  );
  assert.equal(
    (
      await request("/api/auth/signup", "POST", {
        fullName: "A",
        email: "ALICE@example.com",
        password: "password123",
      })
    ).status,
    409,
  );
  const users = await request("/api/messages/users", "GET", undefined, alice);
  assert.equal(users.status, 200);
  assert.equal(users.data[0].email, undefined);
});
test("text, multi-tab realtime, unread counts, reply, read receipts and sender-only delete", async () => {
  const a = await connect(alice),
    a2 = await connect(alice),
    b = await connect(bob);
  const arrived = once(b, "newMessage"),
    mirrored = once(a2, "newMessage");
  const sent = await request(
    `/api/messages/send/${bob.id}`,
    "POST",
    { text: "Hello Bob" },
    alice,
  );
  assert.equal(sent.status, 201);
  assert.equal((await arrived)._id, sent.data._id);
  assert.equal((await mirrored)._id, sent.data._id);
  const users = await request("/api/messages/users", "GET", undefined, bob);
  assert.equal(users.data.find((u: any) => u._id === alice.id).unreadCount, 1);
  const seen = once(a, "messagesSeen");
  assert.equal(
    (await request(`/api/messages/seen/${alice.id}`, "PUT", {}, bob)).status,
    200,
  );
  assert.deepEqual((await seen).messageIds, [sent.data._id]);
  const reply = await request(
    `/api/messages/send/${alice.id}`,
    "POST",
    { text: "Reply", replyTo: sent.data._id },
    bob,
  );
  assert.equal(reply.status, 201);
  assert.equal(reply.data.replyTo.senderId, alice.id);
  assert.equal(
    (
      await request(
        `/api/messages/send/${eve.id}`,
        "POST",
        { text: "Wrong conversation", replyTo: sent.data._id },
        bob,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(`/api/messages/${sent.data._id}`, "DELETE", undefined, bob))
      .status,
    404,
  );
  const deletion = once(b, "messageDeleted");
  assert.equal(
    (
      await request(
        `/api/messages/${sent.data._id}`,
        "DELETE",
        undefined,
        alice,
      )
    ).status,
    200,
  );
  assert.equal((await deletion).messageId, sent.data._id);
  const history = await request(
    `/api/messages/${alice.id}`,
    "GET",
    undefined,
    bob,
  );
  assert.equal(history.data[0].isDeleted, true);
  assert.equal(history.data[0].text, "");
  assert.equal(history.data[1].replyTo.isDeleted, true);
  const spoof = once(b, "typing");
  a.emit("typing", { receiverId: bob.id, senderId: eve.id });
  assert.equal((await spoof).senderId, alice.id);
});
test("media validation and image/voice payloads use correct MIME types", async () => {
  assert.throws(() => parseMedia("https://example.com/image.jpg", "image"));
  assert.throws(() =>
    parseMedia("data:image/svg+xml;base64,PHN2Zz4=", "image"),
  );
  assert.equal(
    parseMedia("data:audio/webm;codecs=opus;base64,YWJj", "audio").mimeType,
    "audio/webm",
  );
  const original = cloudinary.uploader.upload;
  const uploads: string[] = [];
  process.env.CLOUDINARY_CLOUD_NAME = "test";
  process.env.CLOUDINARY_API_KEY = "test";
  process.env.CLOUDINARY_API_SECRET = "test";
  cloudinary.uploader.upload = (async (data: string) => {
    uploads.push(data);
    return { secure_url: "https://example.com/media", public_id: "test" };
  }) as typeof original;
  try {
    for (const draft of [
      { image: "data:image/png;base64,YWJj" },
      { audio: "data:audio/mp4;base64,YWJj", audioDuration: 2 },
    ]) {
      const sent = await request(
        `/api/messages/send/${bob.id}`,
        "POST",
        draft,
        alice,
      );
      assert.equal(sent.status, 201);
      assert.equal(
        sent.data.image || sent.data.audio,
        "https://example.com/media",
      );
    }
    assert.ok(uploads[1].startsWith("data:audio/mp4;"));
    assert.equal(
      (
        await request(
          `/api/messages/send/${bob.id}`,
          "POST",
          { audio: "YWJj" },
          alice,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/messages/send/${bob.id}`,
          "POST",
          { text: "", audioDuration: -1 },
          alice,
        )
      ).status,
      400,
    );
  } finally {
    cloudinary.uploader.upload = original;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  }
});
test("first profanity immediately bans for 24 hours, parallel sends are blocked, and expired bans allow sending", async () => {
  assert.equal(
    containsProfanity("A normal discussion about assignments"),
    false,
  );
  assert.equal(containsProfanity("F U N"), false);
  assert.equal(containsProfanity("sh1t!"), true);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      request(`/api/messages/send/${bob.id}`, "POST", { text: "shit" }, eve),
    ),
  );
  assert.ok(results.every((r) => r.status === 403 && r.data.code === "BANNED"));
  const user = await User.findById(eve.id);
  assert.ok(user!.bannedUntil!.getTime() > Date.now());
  assert.equal(
    (
      await request(
        `/api/messages/send/${bob.id}`,
        "POST",
        { text: "Hello" },
        eve,
      )
    ).status,
    403,
  );
  await User.findByIdAndUpdate(eve.id, {
    bannedUntil: new Date(Date.now() - 1000),
  });
  assert.equal(
    (
      await request(
        `/api/messages/send/${bob.id}`,
        "POST",
        { text: "Hello again" },
        eve,
      )
    ).status,
    201,
  );
});

test("deleting an unread message fixes recipient counters and profile uploads return the correct field", async () => {
  await request(`/api/messages/seen/${alice.id}`, "PUT", {}, bob);
  const socket = await connect(bob);
  const sent = await request(
    `/api/messages/send/${bob.id}`,
    "POST",
    { text: "Unread to delete" },
    alice,
  );
  const event = once(socket, "messageDeleted");
  assert.equal(
    (
      await request(
        `/api/messages/${sent.data._id}`,
        "DELETE",
        undefined,
        alice,
      )
    ).status,
    200,
  );
  assert.equal((await event).unreadCount, 0);
  const original = cloudinary.uploader.upload;
  process.env.CLOUDINARY_API_KEY = "test";
  process.env.CLOUDINARY_API_SECRET = "test";
  process.env.CLOUDINARY_CLOUD_NAME = "test";
  cloudinary.uploader.upload = (async () => ({
    secure_url: "https://example.com/avatar.png",
    public_id: "test",
  })) as typeof original;
  try {
    const form = new FormData();
    form.append("fullName", "Alice Updated");
    form.append(
      "image",
      new Blob(["fake PNG"], { type: "image/png" }),
      "avatar.png",
    );
    const response = await fetch(base + "/api/auth/update-profile", {
      method: "PUT",
      headers: { Cookie: alice.cookie },
      body: form,
    });
    assert.equal(response.status, 200);
    const user = await response.json();
    assert.equal(user.fullName, "Alice Updated");
    assert.equal(user.profilePicture, "https://example.com/avatar.png");
    assert.equal(user.password, undefined);
  } finally {
    cloudinary.uploader.upload = original;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  }
});

test("delivery and read receipts belong to the recipient and read only the requested messages", async () => {
  const sender = await signup("receipt-sender"),
    receiver = await signup("receipt-receiver");
  const first = await request(
    `/api/messages/send/${receiver.id}`,
    "POST",
    { text: "First receipt test" },
    sender,
  );
  const second = await request(
    `/api/messages/send/${receiver.id}`,
    "POST",
    { text: "Second receipt test" },
    sender,
  );
  assert.equal(first.data.isDelivered, false);
  assert.equal(first.data.isRead, false);
  const senderSocket = await connect(sender);
  // The sender cannot acknowledge delivery on behalf of another account.
  const forbidden = await request(
    "/api/messages/delivered",
    "PUT",
    { messageIds: [first.data._id] },
    sender,
  );
  assert.deepEqual(forbidden.data.messageIds, []);
  const delivered = once(senderSocket, "messagesDelivered");
  assert.equal(
    (
      await request(
        "/api/messages/delivered",
        "PUT",
        { messageIds: [first.data._id, second.data._id] },
        receiver,
      )
    ).status,
    200,
  );
  assert.equal((await delivered).messageIds.length, 2);
  let history = await request(
    `/api/messages/${receiver.id}`,
    "GET",
    undefined,
    sender,
  );
  assert.ok(history.data.every((m: any) => m.isDelivered && !m.isRead));
  const seen = once(senderSocket, "messagesSeen");
  const read = await request(
    `/api/messages/seen/${sender.id}`,
    "PUT",
    { messageIds: [first.data._id] },
    receiver,
  );
  assert.equal(read.data.unreadCount, 1);
  assert.deepEqual((await seen).messageIds, [first.data._id]);
  history = await request(
    `/api/messages/${receiver.id}`,
    "GET",
    undefined,
    sender,
  );
  assert.equal(history.data[0].isRead, true);
  assert.equal(history.data[1].isRead, false);
  assert.equal(
    (
      await request(
        "/api/messages/delivered",
        "PUT",
        { messageIds: ["invalid"] },
        receiver,
      )
    ).status,
    400,
  );
});

test("quota errors deliver normal messages and replies with a sender warning while local profanity remains blocked", async (t) => {
  const sender = await signup("quota-sender"),
    receiver = await signup("quota-receiver");
  const { default: https } = await import("node:https");
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-quota-key";
  t.after(() => {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  let calls = 0;
  t.mock.method(
    https,
    "request",
    (_options: unknown, callback: (response: unknown) => void) => {
      calls++;
      const req = Object.assign(new EventEmitter(), {
        end() {
          process.nextTick(() => {
            const response = Object.assign(Readable.from([Buffer.from("{}")]), {
              statusCode: 429,
            });
            response.on("end", () => req.emit("close"));
            callback(response);
          });
        },
        destroy(error: Error) {
          req.emit("error", error);
          req.emit("close");
        },
      });
      return req;
    },
  );
  const sent = await request(
    `/api/messages/send/${receiver.id}`,
    "POST",
    { text: "Send during quota limit" },
    sender,
  );
  assert.equal(sent.status, 201);
  assert.match(sent.data.moderationWarning, /limit reached/);
  assert.equal(calls, 1);
  const reply = await request(
    `/api/messages/send/${receiver.id}`,
    "POST",
    { text: "Reply during quota cooldown", replyTo: sent.data._id },
    sender,
  );
  assert.equal(reply.status, 201);
  assert.equal(reply.data.replyTo._id, sent.data._id);
  assert.match(reply.data.moderationWarning, /limit reached/);
  assert.equal(calls, 1);
  const blocked = await request(
    `/api/messages/send/${receiver.id}`,
    "POST",
    { text: "shit" },
    sender,
  );
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "BANNED");
  assert.equal(calls, 1);
  const history = await request(
    `/api/messages/${sender.id}`,
    "GET",
    undefined,
    receiver,
  );
  assert.equal(history.data.length, 2);
  assert.equal(history.data[0].moderationWarning, undefined);
});

test("one violation blocks all recipients and media, persists across login, notifies every tab, and expires", async () => {
  const offender = await signup("one-violation-user");
  const tab1 = await connect(offender),
    tab2 = await connect(offender);
  const notified1 = once(tab1, "moderationUpdated"),
    notified2 = once(tab2, "moderationUpdated");
  const started = Date.now();
  const blocked = await request(
    `/api/messages/send/${bob.id}`,
    "POST",
    { text: "shit" },
    offender,
  );
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "BANNED");
  const expiry = new Date(blocked.data.bannedUntil).getTime();
  assert.ok(expiry >= started + 86400000 && expiry <= Date.now() + 86400000);
  assert.equal((await notified1).bannedUntil, blocked.data.bannedUntil);
  assert.equal((await notified2).bannedUntil, blocked.data.bannedUntil);
  assert.equal((await User.findById(offender.id))!.moderationStrikes, 1);
  for (const receiverId of [alice.id, bob.id])
    for (const draft of [
      { text: "Normal message" },
      { image: "data:image/png;base64,YWJj" },
      { audio: "data:audio/webm;base64,YWJj", audioDuration: 1 },
    ]) {
      const response = await request(
        `/api/messages/send/${receiverId}`,
        "POST",
        draft,
        offender,
      );
      assert.equal(response.status, 403);
      assert.equal(response.data.bannedUntil, blocked.data.bannedUntil);
    }
  const login = await request("/api/auth/login", "POST", {
    email: "one-violation-user@example.com",
    password: "password123",
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.bannedUntil, blocked.data.bannedUntil);
  const history = await request(
    `/api/messages/${offender.id}`,
    "GET",
    undefined,
    bob,
  );
  assert.deepEqual(history.data, []);
  await User.findByIdAndUpdate(offender.id, {
    bannedUntil: new Date(Date.now() - 1),
  });
  assert.equal(
    (
      await request(
        `/api/messages/send/${bob.id}`,
        "POST",
        { text: "Normal message after expiry" },
        offender,
      )
    ).status,
    201,
  );
});
