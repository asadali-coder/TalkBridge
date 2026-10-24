import jwt from "jsonwebtoken";
import type { Response } from "express";
import { cookieOptions, secret } from "./config.js";
export function generateToken(userId: unknown, res: Response) {
  const token = jwt.sign({ userId: String(userId) }, secret(), {
    expiresIn: "7d",
  });
  res.cookie("jwt", token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}
