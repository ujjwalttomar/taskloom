import crypto from "crypto";
import { Request, Response } from "express";
import { GoogleCallbackSchema } from "../schemas/auth.schemas";
import * as authService from "../services/auth.service";
import { AppError } from "../utils/AppError";
import { handleError } from "../utils/handleError";
import { signWsTicket } from "../../../shared/auth/token";

// Evaluated per call: this module is imported before dotenv.config() runs
const isProduction = () => process.env.NODE_ENV === "production";

const cookieOpts = (maxAge: number) => ({
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? ("none" as const) : ("strict" as const),
    maxAge,
});

// Short-lived cookie holding the OAuth `state` + where to go after login.
// Lax is enough: it is read on the top-level redirect back from Google, on this same host.
const OAUTH_COOKIE = "oauth_state";
const oauthCookieOpts = () => ({
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/auth",
});

/** Only same-site relative paths are allowed, so the redirect can't be abused (open redirect). */
function safeReturnTo(value: unknown): string {
    if (typeof value !== "string" || value.length > 300) return "/dashboard";
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
    return value;
}

/** Send the user back to the app with a short error code instead of a raw JSON error page. */
function failLogin(res: Response, code: string) {
    res.clearCookie(OAUTH_COOKIE, oauthCookieOpts());
    res.redirect(`${process.env.FRONTEND_URL}/?authError=${code}`);
}

export const redirectToGoogle = (req: Request, res: Response) => {
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(OAUTH_COOKIE, { state, returnTo: safeReturnTo(req.query.returnTo) }, {
        ...oauthCookieOpts(),
        maxAge: 10 * 60 * 1000,
    });
    res.redirect(authService.buildGoogleAuthUrl(state));
};

export const handleGoogleCallback = async (req: Request, res: Response) => {
    // The user pressed "Cancel" on Google's consent screen
    if (req.query.error) return failLogin(res, "cancelled");

    const parsed = GoogleCallbackSchema.safeParse({ query: req.query });
    const saved = req.cookies[OAUTH_COOKIE] as { state?: string; returnTo?: string } | undefined;
    // `state` must match the one we issued to THIS browser — blocks login CSRF
    if (!parsed.success || !saved?.state || saved.state !== parsed.data.query.state) {
        return failLogin(res, "invalid_state");
    }

    try {
        const { accessToken, refreshToken } = await authService.handleGoogleLogin(parsed.data.query.code);
        res.clearCookie(OAUTH_COOKIE, oauthCookieOpts());
        res.cookie("accessToken", accessToken, cookieOpts(15 * 60 * 1000));
        res.cookie("refreshToken", refreshToken, cookieOpts(7 * 24 * 60 * 60 * 1000));
        res.redirect(`${process.env.FRONTEND_URL}${safeReturnTo(saved.returnTo)}`);
    } catch (error) {
        if (error instanceof AppError && error.statusCode === 403) return failLogin(res, "unverified_email");
        console.error("[auth] google login failed:", (error as Error).message);
        return failLogin(res, "login_failed");
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
        handleError(res, error);
    }
};

export const getCurrentUser = async (req: Request, res: Response) => {
    try {
        const user = await authService.getCurrentUser(req.userId!);
        res.status(200).json({ user });
    } catch (error) {
        handleError(res, error);
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
        handleError(res, error);
    }
};

// GET /auth/ws-ticket — a 60-second token the browser passes to the WebSocket server.
// Needed because the auth cookie belongs to this host and is never sent to the WS host.
export const getWsTicket = (req: Request, res: Response) => {
    res.status(200).json({ ticket: signWsTicket(req.userId!) });
};
