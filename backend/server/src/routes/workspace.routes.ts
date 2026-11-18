import express from "express";
import { authenticate, isAdmin, isMember } from "../middlewares/auth.middleware";
import { getAllWorkspaces, getSpecificWorkspace, editWorkspace, createWorkspace, deleteWorkspace, deleteMember, updateMemberRole, leaveWorkspace } from "../controllers/workspace.controller";
import { getWorkspaceProfile } from "../controllers/userProfile.controller";

const router = express.Router();

router.post("/workspaces", authenticate, createWorkspace);
router.get("/workspaces", authenticate, getAllWorkspaces);
router.get("/workspaces/:workspaceId", authenticate, isMember, getSpecificWorkspace);
router.patch("/workspaces/:workspaceId", authenticate, isMember, isAdmin, editWorkspace);
router.delete("/workspaces/:workspaceId", authenticate, isMember, isAdmin, deleteWorkspace);
router.patch("/workspaces/:workspaceId/members/:memberId", authenticate, isMember, isAdmin, updateMemberRole);
router.delete("/workspaces/:workspaceId/members/:memberId", authenticate, isMember, isAdmin, deleteMember);
// Any member can leave (the service refuses the last admin)
router.post("/workspaces/:workspaceId/leave", authenticate, isMember, leaveWorkspace);
router.get("/workspaces/:workspaceId/members/:memberId/profile", authenticate, getWorkspaceProfile);

export default router;
