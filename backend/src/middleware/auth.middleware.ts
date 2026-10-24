import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { secret } from "../libs/config.js";
export const protectRoute: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.jwt;
    if (!token) {
      res.status(401).json({ message: "Please log in" });
      return;
    }
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === "string" || typeof decoded.userId !== "string")
      throw new Error("Invalid token");
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      res.status(401).json({ message: "Please log in again" });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session" });
  }
};
