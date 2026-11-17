import express from "express";
import { redirectToGoogle, getCurrentUser, handleGoogleCallback, refreshAccessToken, logoutUser, getWsTicket } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { loginLimiter } from "../middlewares/rateLimiter";

const router = express.Router();

router.get("/google", loginLimiter, redirectToGoogle);
router.get("/google/callback", loginLimiter, handleGoogleCallback);
router.get("/me", authenticate, getCurrentUser);
router.get("/ws-ticket", authenticate, getWsTicket);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logoutUser);

export default router;
