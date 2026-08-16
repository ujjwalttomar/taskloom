import { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";
import { signAccessToken, generateRefreshToken } from "../../../shared/auth/token";
import prisma from "../../../shared/db/client";

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

const isProduction = process.env.NODE_ENV === "production";

export const redirectToGoogle = (req: Request, res: Response) => {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: "code",
        scope: "email profile",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export const handleGoogleCallback = async (req: Request, res: Response) => {
    try {
        const code = req.query.code?.toString();
        if (!code) {
            res.status(400).json({ error: "Authorization code missing" });
            return;
        }

        const { tokens } = await getOAuthClient().getToken(code);

        const ticket = await getOAuthClient().verifyIdToken({
            idToken: tokens.id_token!,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const googleUser = ticket.getPayload();

        if (!googleUser?.email || !googleUser?.name) {
            res.status(400).json({ error: "Google account missing required info" });
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

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    } catch (error) {
        res.status(500).json({ message: "server side error !", error });
    }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies["refreshToken"];
        if (!refreshToken) {
            res.status(401).json({ message: "Refresh token missing" });
            return;
        }

        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
        });

        if (!storedToken || storedToken.expiresAt < new Date()) {
            res.status(401).json({ message: "Refresh token expired or invalid" });
            return;
        }

        const accessToken = signAccessToken(storedToken.userId);

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });

        res.status(200).json({ message: "token refreshed!" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

export const getCurrentUser = async (req: Request, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId! },
            select: { id: true, name: true, email: true, googleId: true, createdAt: true },
        });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

export const logoutUser = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies["refreshToken"];
        if (refreshToken) {
            await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
        }
        res.clearCookie("accessToken");
        res.clearCookie("refreshToken");
        res.status(200).json({ message: "logged out successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
