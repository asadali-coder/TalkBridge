import "dotenv/config";
export const origins = (
  process.env.CLIENT_URL ||
  "http://localhost:5173,http://localhost:5174" ||
  "https://talk-bridge-chat.vercel.app/"
)
  .split(",")
  .map((s) => s.trim());
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.COOKIE_SAME_SITE || "lax") as
    | "lax"
    | "none"
    | "strict",
  path: "/",
};
export function secret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
  return process.env.JWT_SECRET;
}
