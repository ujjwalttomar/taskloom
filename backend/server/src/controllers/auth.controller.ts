import { Request, Response } from "express";
import { ZodError } from "zod";
import { GoogleCallbackSchema } from "../schemas/auth.schemas";
import * as authService from "../services/auth.service";
import { AppError } from "../utils/AppError";

const isProduction = process.env.NODE_ENV === "production";

const cookieOpts = (maxAge: number) => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("strict" as const),
    maxAge,
});

export const redirectToGoogle = (req: Request, res: Response) => {
    res.redirect(authService.buildGoogleAuthUrl());
};

export const handleGoogleCallback = async (req: Request, res: Response) => {
    try {
        const parsed = GoogleCallbackSchema.safeParse({ query: req.query });
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
            return;
        }
        const { code } = parsed.data.query;
        const { accessToken, refreshToken } = await authService.handleGoogleLogin(code);

        res.cookie("accessToken", accessToken, cookieOpts(15 * 60 * 1000));
        res.cookie("refreshToken", refreshToken, cookieOpts(7 * 24 * 60 * 60 * 1000));
        res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        res.status(500).json({ message: "server side error!", error });
    }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies["refreshToken"];
        if (!refreshToken) {
            res.status(401).json({ message: "Refresh token missing" });
            return;
        }
        const accessToken = await authService.refreshAccessToken(refreshToken);
        res.cookie("accessToken", accessToken, cookieOpts(15 * 60 * 1000));
        res.status(200).json({ message: "token refreshed!" });
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: "Server error" });
    }
};

export const getCurrentUser = async (req: Request, res: Response) => {
    try {
        const user = await authService.getCurrentUser(req.userId!);
        res.status(200).json({ user });
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: "Server error" });
    }
};

export const logoutUser = async (req: Request, res: Response) => {
    try {
        await authService.logout(req.cookies["refreshToken"]);
        const opts = cookieOpts(0);
        res.clearCookie("accessToken", opts);
        res.clearCookie("refreshToken", opts);
        res.status(200).json({ message: "logged out successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
