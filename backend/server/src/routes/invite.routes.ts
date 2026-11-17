import express from "express";
import { sendInvite, getInviteDetails, acceptInvite } from "../controllers/invite.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { isMember, isAdmin } from "../middlewares/auth.middleware";
import { inviteLimiter } from "../middlewares/rateLimiter";

const router = express.Router();

// send invite — workspace admin only
router.post(
    "/workspaces/:workspaceId/invites",
    authenticate,
    isMember,
    isAdmin,
    inviteLimiter, // after the auth checks, so anonymous requests can't use up an admin's quota
    sendInvite
);

// public — get invite details (shown on the /invite/:token page before login)
router.get("/invites/:token", getInviteDetails);

// accept invite — must be logged in
router.post("/invites/:token/accept", authenticate, acceptInvite);

export default router;
