import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getUsersForSidebar,
  getMessages,
  sendMessage,
  markSeen,
  markDelivered,
  deleteMessage,
} from "../controllers/message.controller.js";
const router = Router();
router.use(protectRoute);
router.get("/users", getUsersForSidebar);
router.put("/delivered", markDelivered);
router.get("/:id", getMessages);
router.post("/send/:id", sendMessage);
router.put("/seen/:id", markSeen);
router.delete("/:id", deleteMessage);
export default router;
