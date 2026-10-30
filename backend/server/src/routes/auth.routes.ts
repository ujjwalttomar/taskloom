

import express from "express";
import {redirectToGoogle, getCurrentUser, handleGoogleCallback, refreshAccessToken, logoutUser} from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();


router.get("/google", redirectToGoogle);   
router.get("/me", authenticate, getCurrentUser);    
router.get("/google/callback", handleGoogleCallback);
router.post("/refresh", refreshAccessToken);     
router.post("/logout", logoutUser);

export default router;