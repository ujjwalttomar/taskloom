import jwt from "jsonwebtoken";
import { TokenPayload, ACCESS_TOKEN_EXPIRY } from "./types.js";
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
    return jwt.verify(token, getSecret()) as TokenPayload;
}
