import express from "express";
import { getAllCards, getSpecificCard, createCard, editCard, deleteCard, moveCard, assignCard, unassignCard } from "../controllers/card.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { isBoardMember } from "../middlewares/board.middleware";
import { resolveBoardFromList, resolveBoardFromCard } from "../middlewares/card.middleware";

const router = express.Router();

router.get("/lists/:listId/cards", authenticate, resolveBoardFromList, isBoardMember, getAllCards);
router.post("/lists/:listId/cards", authenticate, resolveBoardFromList, isBoardMember, createCard);
router.get("/cards/:cardId", authenticate, resolveBoardFromCard, isBoardMember, getSpecificCard);
router.patch("/cards/:cardId", authenticate, resolveBoardFromCard, isBoardMember, editCard);
router.delete("/cards/:cardId", authenticate, resolveBoardFromCard, isBoardMember, deleteCard);
router.patch("/cards/:cardId/move", authenticate, resolveBoardFromCard, isBoardMember, moveCard);
router.post("/cards/:cardId/assign", authenticate, resolveBoardFromCard, isBoardMember, assignCard);
router.delete("/cards/:cardId/assign/:userId", authenticate, resolveBoardFromCard, isBoardMember, unassignCard);

export default router;
