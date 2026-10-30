
import { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";
import { signAccessToken, generateRefreshToken } from "../../../shared/auth/token";
import prisma from "../../../shared/db/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";

const isProduction = process.env.NODE_ENV === "production";

// Shared cookie options — used for both set and clear so attributes always match
const cookieBase = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
};

let client: OAuth2Client;

function getOAuthClient() {
    if (!client) {
        client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI,
        );
    }
    return client;
}

export const redirectToGoogle = (req: Request, res: Response, next: NextFunction) => {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: "code",
        scope: "email profile",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

// Kept manual — OAuth callback redirects on success, can't use asyncHandler + next(err)
export const handleGoogleCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const code = req.query.code?.toString();
        if (!code) {
            res.status(400).json({ status: "error", message: "Authorization code missing" });
            return;
        }

        const { tokens } = await getOAuthClient().getToken(code);

        const ticket = await getOAuthClient().verifyIdToken({
            idToken: tokens.id_token!,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const googleUser = ticket.getPayload();
        if (!googleUser?.email || !googleUser?.name) {
            res.status(400).json({ status: "error", message: "Google account missing required info" });
            return;
        }

        let user = await prisma.user.findUnique({ where: { email: googleUser.email } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: googleUser.email!,
                    name: googleUser.name!,
                    googleId: googleUser.sub,
                },
            });
        }

        const accessToken = signAccessToken(user.id);
        const refreshToken = generateRefreshToken();

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        res.cookie("accessToken", accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
        res.cookie("refreshToken", refreshToken, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });

        res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    } catch (error: any) {
        console.error("handleGoogleCallback error:", error.message ?? error);
        res.status(500).json({ status: "error", message: error.message ?? "OAuth error" });
    }
};

export const refreshAccessToken = asyncHandler(async (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) throw new AppError(401, "No refresh token");

    const refreshToken = await prisma.refreshToken.findUnique({ where: { token } });
    if (!refreshToken) throw new AppError(401, "Invalid refresh token");

    if (refreshToken.expiresAt <= new Date()) {
        await prisma.refreshToken.delete({ where: { token } });
        res.clearCookie("accessToken", cookieBase);
        res.clearCookie("refreshToken", cookieBase);
        throw new AppError(401, "Refresh token expired");
    }

    const accessToken = signAccessToken(refreshToken.userId);
    res.cookie("accessToken", accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });

    return res.status(200).json({ message: "Token refreshed" });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, name: true, email: true, googleId: true, createdAt: true },
    });

    if (!user) throw new AppError(404, "User not found");

    return res.status(200).json({ user });
});

export const logoutUser = asyncHandler(async (req, res) => {
    const token = req.cookies.refreshToken;

    if (token) {
        await prisma.refreshToken.delete({ where: { token } }).catch(() => {});
    }

    res.clearCookie("accessToken", cookieBase);
    res.clearCookie("refreshToken", cookieBase);
    return res.status(200).json({ message: "Logged out successfully" });
});
