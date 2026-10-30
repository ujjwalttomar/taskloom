
import express from "express";
import { authenticate, isAdmin, isMember} from "../middlewares/auth.middleware";
import { getAllWorkspaces, getSpecificWorkspace, editWorkspace, createWorkspace, deleteWorkspace, addMembers
        , deleteMember,updateMemberRole} from "../controllers/workspace.controller";

const router = express.Router();

router.post("/workspaces", authenticate, createWorkspace);
router.get("/workspaces", authenticate, getAllWorkspaces);
router.get("/workspaces/:workspaceId", authenticate, isMember, getSpecificWorkspace);
router.patch("/workspaces/:workspaceId", authenticate, isMember, isAdmin, editWorkspace);
router.delete("/workspaces/:workspaceId", authenticate, isMember, isAdmin, deleteWorkspace);
router.post("/workspaces/:workspaceId/members", authenticate, isMember, isAdmin, addMembers);
router.patch("/workspaces/:workspaceId/members/:memberId", authenticate, isMember, isAdmin, updateMemberRole);
router.delete("/workspaces/:workspaceId/members/:memberId", authenticate, isMember, isAdmin, deleteMember);

export default router;

