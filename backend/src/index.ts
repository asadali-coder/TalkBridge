import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, server } from "./libs/socket.js";
import { origins, secret } from "./libs/config.js";
import { connectDB } from "./libs/db.js";
import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { HttpError } from "./services/media.service.js";
app.disable("x-powered-by");
app.use(
  cors({
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    origin &&
    !origins.includes(origin)
  ) {
    res.status(403).json({ message: "Origin not allowed" });
    return;
  }
  next();
});
app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Route not found" });
});
if (process.env.SERVE_FRONTEND === "true") {
  const dist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../frontend/dist",
  );
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status =
    error instanceof HttpError
      ? error.status
      : error.code === "LIMIT_FILE_SIZE"
        ? 413
        : error.status === 413
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;
  if (status === 500) console.error(error);
  res.status(status).json({
    message: status === 500 ? "Server error. Please try again." : error.message,
  });
};
app.use(errorHandler);
export async function start() {
  secret();
  await connectDB();
  await new Promise<void>((resolve) =>
    server.listen(Number(process.env.PORT) || 5000, resolve),
  );
  console.log("Chat server is ready");
}
if (process.env.NODE_ENV !== "test")
  start().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
export { app, server };
