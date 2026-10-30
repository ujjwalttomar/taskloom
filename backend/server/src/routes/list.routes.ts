
import express from "express";
import {getAllLists, createList, editList, deleteList, changeOrder} from "../controllers/list.controller";
import { isBoardMember } from "../middlewares/board.middleware";
import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/boards/:boardId/lists", authenticate, isBoardMember, getAllLists);
router.post("/boards/:boardId/lists", authenticate, isBoardMember, createList);
router.patch("/boards/:boardId/lists/:listId", authenticate, isBoardMember, editList);
router.delete("/boards/:boardId/lists/:listId", authenticate, isBoardMember, deleteList);
router.patch("/boards/:boardId/lists/:listId/order", authenticate, isBoardMember, changeOrder);

export default router;