import { Request, Response } from "express";
import {
    CreateBoardSchema,
    EditBoardSchema,
    AddBoardMemberSchema,
    UpdateBoardMemberRoleSchema,
} from "../schemas/board.schemas";
import * as boardService from "../services/board.service";
import { AppError } from "../utils/AppError";

function handleError(res: Response, error: unknown) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "Server error" });
}

function firstIssue(err: { issues: { message: string }[] }) {
    return err.issues[0]?.message ?? "Validation error";
}

export const getAllBoards = async (req: Request, res: Response) => {
    try {
        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const boards = await boardService.getAllBoards(workspaceId, req.userId!);
        return res.status(200).json({ boards });
    } catch (error) {
        return handleError(res, error);
    }
};

export const createBoard = async (req: Request, res: Response) => {
    try {
        const parsed = CreateBoardSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const workspaceId = parseInt(req.params["workspaceId"] as string);
        const { title, description } = parsed.data.body;
        const board = await boardService.createBoard(workspaceId, req.userId!, title, description);
        return res.status(201).json({ message: "Board created", board });
    } catch (error) {
        return handleError(res, error);
    }
};

export const getSpecificBoard = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params["boardId"] as string);
        const board = await boardService.getBoard(boardId);
        return res.status(200).json({ board });
    } catch (error) {
        return handleError(res, error);
    }
};

export const editBoard = async (req: Request, res: Response) => {
    try {
        const parsed = EditBoardSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const board = await boardService.editBoard(boardId, req.userId!, parsed.data.body);
        return res.status(200).json({ board });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteBoard = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params["boardId"] as string);
        await boardService.deleteBoard(boardId, req.userId!);
        return res.status(200).json({ message: "Board deleted", boardId });
    } catch (error) {
        return handleError(res, error);
    }
};

export const addMember = async (req: Request, res: Response) => {
    try {
        const parsed = AddBoardMemberSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const { email, role } = parsed.data.body;
        const memberRole = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";
        const member = await boardService.addMember(boardId, req.userId!, email, memberRole);
        return res.status(201).json({ message: "Member added", member });
    } catch (error) {
        return handleError(res, error);
    }
};

export const updateBoardMemberRole = async (req: Request, res: Response) => {
    try {
        const parsed = UpdateBoardMemberRoleSchema.safeParse({ body: req.body });
        if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

        const boardId = parseInt(req.params["boardId"] as string);
        const memberId = parseInt(req.params["memberId"] as string);
        const { role } = parsed.data.body;
        const updated = await boardService.updateBoardMemberRole(boardId, memberId, req.userId!, role);
        return res.status(200).json({ message: "Role updated", member: updated });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteMember = async (req: Request, res: Response) => {
    try {
        const boardId = parseInt(req.params["boardId"] as string);
        const memberId = parseInt(req.params["memberId"] as string);
        await boardService.deleteBoardMember(boardId, memberId, req.userId!);
        return res.status(200).json({ message: "Member removed", memberId });
    } catch (error) {
        return handleError(res, error);
    }
};
