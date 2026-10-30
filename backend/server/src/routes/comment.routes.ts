
import express from "express";
import {getAllComments, createComment, editComment, deleteComment} from "../controllers/comment.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { resolveBoardFromCard} from "../middlewares/card.middleware";
import { resolveBoardFromComment } from "../middlewares/comment.middleware"
import {isBoardMember} from "../middlewares/board.middleware";

const router = express.Router();

router.get("/cards/:cardId/comments", authenticate, resolveBoardFromCard, isBoardMember, getAllComments);
router.post("/cards/:cardId/comments", authenticate, resolveBoardFromCard, isBoardMember, createComment);
router.patch("/comments/:commentId", authenticate, resolveBoardFromComment, isBoardMember, editComment);
router.delete("/comments/:commentId", authenticate, resolveBoardFromComment, isBoardMember, deleteComment);

export default router;
