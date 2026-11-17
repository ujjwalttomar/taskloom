import jwt from "jsonwebtoken";
import { TokenPayload, ACCESS_TOKEN_EXPIRY, WS_TICKET_EXPIRY } from "./types.js";
import crypto from "crypto";

function getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not defined in environment variables");
    }
    return secret;
}

export function signAccessToken(userId: number): string {
    return jwt.sign({ userId }, getSecret(), {
        expiresIn: ACCESS_TOKEN_EXPIRY,
    });
}

export function generateRefreshToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

export function verifyAccessToken(token: string): TokenPayload {
    const payload = jwt.verify(token, getSecret()) as TokenPayload & { purpose?: string };
    if (payload.purpose) throw new Error("Not an access token");
    return payload;
}

/**
 * Short-lived ticket for opening a WebSocket. The browser fetches it from the REST API
 * (where the auth cookie lives) and passes it in the WS URL, because the cookie is
 * host-only and never reaches the separately hosted WebSocket server.
 */
export function signWsTicket(userId: number): string {
    return jwt.sign({ userId, purpose: "ws" }, getSecret(), { expiresIn: WS_TICKET_EXPIRY });
}

export function verifyWsTicket(ticket: string): TokenPayload {
    const payload = jwt.verify(ticket, getSecret()) as TokenPayload & { purpose?: string };
    if (payload.purpose !== "ws") throw new Error("Not a ws ticket");
    return payload;
}
