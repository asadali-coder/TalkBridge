import { Router } from "express";
import {
  signup,
  login,
  logout,
  updateProfile,
  checkAuth,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import multer from "multer";
const router = Router();
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.put(
  "/update-profile",
  protectRoute,
  upload.single("image"),
  updateProfile,
);

router.get("/check", protectRoute, checkAuth);

export default router;
