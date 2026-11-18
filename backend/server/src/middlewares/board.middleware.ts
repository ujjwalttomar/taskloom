import { Request, Response, NextFunction } from "express";
import { getBoardRole } from "../../../shared/db/access";
import { parseId } from "../utils/parseId";

export const isBoardMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const boardId = parseId(req.params.boardId, "board id");
        // Board members, plus every admin of the board's workspace (shared/db/access.ts)
        const role = await getBoardRole(boardId, req.userId!);
        if (!role) {
            res.status(403).json({ message: "Not a member of this board" });
            return;
        }
        // The EFFECTIVE role: isBoardAdmin and the services read it from here
        req.boardMembership = { boardId, memberId: req.userId!, role };
        next();
    } catch (error) {
        next(error);
    }
};

export const isBoardAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.boardMembership?.role !== "ADMIN") {
        res.status(403).json({ message: "Only board admins can do this" });
        return;
    }
    next();
};
