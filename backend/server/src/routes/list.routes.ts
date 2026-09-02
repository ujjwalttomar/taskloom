import express from "express";
import { getAllLists, createList, editList, deleteList, changeOrder } from "../controllers/list.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { isBoardMember, isBoardAdmin } from "../middlewares/board.middleware";

const router = express.Router();

router.get("/boards/:boardId/lists", authenticate, isBoardMember, getAllLists);
router.post("/boards/:boardId/lists", authenticate, isBoardMember, createList);
router.patch("/boards/:boardId/lists/:listId", authenticate, isBoardMember, editList);
router.delete("/boards/:boardId/lists/:listId", authenticate, isBoardMember, isBoardAdmin, deleteList);
router.patch("/boards/:boardId/lists/:listId/order", authenticate, isBoardMember, changeOrder);

export default router;
