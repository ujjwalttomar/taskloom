import express from "express";
import { getAllBoards, createBoard, getSpecificBoard, editBoard, deleteBoard, addMember, updateBoardMemberRole, deleteMember } from "../controllers/board.controller";
import { authenticate, isMember } from "../middlewares/auth.middleware";
import { isBoardMember, isBoardAdmin } from "../middlewares/board.middleware";

const router = express.Router();

router.get("/workspaces/:workspaceId/boards", authenticate, isMember, getAllBoards);
router.post("/workspaces/:workspaceId/boards", authenticate, isMember, createBoard);
router.get("/boards/:boardId", authenticate, isBoardMember, getSpecificBoard);
router.patch("/boards/:boardId", authenticate, isBoardMember, isBoardAdmin, editBoard);
router.delete("/boards/:boardId", authenticate, isBoardMember, isBoardAdmin, deleteBoard);
router.post("/boards/:boardId/members", authenticate, isBoardMember, isBoardAdmin, addMember);
router.patch("/boards/:boardId/members/:memberId", authenticate, isBoardMember, isBoardAdmin, updateBoardMemberRole);
router.delete("/boards/:boardId/members/:memberId", authenticate, isBoardMember, isBoardAdmin, deleteMember);

export default router;
