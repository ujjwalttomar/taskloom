

import express from "express";
import {redirectToGoogle, getCurrentUser, handleGoogleCallback, refreshAccessToken, logoutUser} from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authLimiter, accountCreationLimiter } from "../middlewares/rateLimiter";

const router = express.Router();

// Auth-specific rate limit: 20 req / 15 min per IP
router.use(authLimiter);

router.get("/google", redirectToGoogle);   
router.get("/me", authenticate, getCurrentUser);    
router.get("/google/callback", accountCreationLimiter, handleGoogleCallback);
router.post("/refresh", refreshAccessToken);     
router.post("/logout", logoutUser);

export default router;