import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import { generateToken } from "../libs/utils.js";
import { cookieOptions } from "../libs/config.js";
import { uploadMedia, HttpError } from "../services/media.service.js";
const publicUser = (user: InstanceType<typeof User>) => {
  const { password: _password, ...safe } = user.toObject();
  return safe;
};
export const signup: RequestHandler = async (req, res) => {
  const { fullName, email, password } = req.body || {};
  if (
    typeof fullName !== "string" ||
    !fullName.trim() ||
    fullName.length > 100 ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length < 6 ||
    password.length > 72
  )
    throw new HttpError(
      400,
      "Enter a name, valid email and password (6–72 characters)",
    );
  try {
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password: await bcrypt.hash(password, 10),
    });
    generateToken(user._id, res);
    res.status(201).json(publicUser(user));
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new HttpError(409, "Email already exists");
    throw error;
  }
};
export const login: RequestHandler = async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string")
    throw new HttpError(400, "Email and password are required");
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.password!)))
    throw new HttpError(401, "Invalid credentials");
  generateToken(user._id, res);
  res.json(publicUser(user));
};
export const logout: RequestHandler = (_req, res) => {
  res.clearCookie("jwt", cookieOptions);
  res.json({ message: "Logged out" });
};
export const checkAuth: RequestHandler = (req, res) => {
  res.json(req.user);
};
export const updateProfile: RequestHandler = async (req, res) => {
  const update: { fullName?: string; profilePicture?: string } = {};
  if (req.body.fullName !== undefined) {
    if (
      typeof req.body.fullName !== "string" ||
      !req.body.fullName.trim() ||
      req.body.fullName.length > 100
    )
      throw new HttpError(400, "Enter a valid name (up to 100 characters)");
    update.fullName = req.body.fullName.trim();
  }
  if (req.file) {
    const result = await uploadMedia(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      "image",
    );
    update.profilePicture = result.url;
  }
  if (!Object.keys(update).length)
    throw new HttpError(400, "Nothing to update");
  res.json(
    await User.findByIdAndUpdate(req.user._id, update, {
      new: true,
      runValidators: true,
    }).select("-password"),
  );
};
