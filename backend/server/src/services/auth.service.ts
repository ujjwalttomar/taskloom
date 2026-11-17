import { OAuth2Client } from "google-auth-library";
import { signAccessToken, generateRefreshToken } from "../../../shared/auth/token";
import * as userRepo from "../repositories/user.repository";
import * as tokenRepo from "../repositories/refreshToken.repository";
import { AppError } from "../utils/AppError";

let client: OAuth2Client;

// Lazy init — must not run at module load time (before dotenv sets env vars)
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

export function buildGoogleAuthUrl(state: string): string {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: "code",
        scope: "email profile",
        state,
        // Let people pick an account (needed when an invite was sent to a different address)
        prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export async function handleGoogleLogin(code: string): Promise<AuthTokens> {
    const { tokens } = await getOAuthClient().getToken(code);

    if (!tokens.id_token) throw new AppError(400, "Google did not return an ID token");
    const ticket = await getOAuthClient().verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
    });

    const googleUser = ticket.getPayload();
    if (!googleUser?.email || !googleUser?.name) {
        throw new AppError(400, "Google account missing required info");
    }
    // Users are matched (and invites accepted) by email, so the email must be proven
    if (googleUser.email_verified !== true) {
        throw new AppError(403, "Google email address is not verified");
    }

    const email = googleUser.email.trim().toLowerCase();
    let user = await userRepo.findUserByEmail(email);
    if (!user) {
        user = await userRepo.createUser({
            email,
            name: googleUser.name,
            googleId: googleUser.sub,
        });
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = generateRefreshToken();

    await tokenRepo.createRefreshToken({
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
    const storedToken = await tokenRepo.findRefreshToken(refreshToken);
    if (!storedToken) throw new AppError(401, "Refresh token expired or invalid");
    if (storedToken.expiresAt < new Date()) {
        await tokenRepo.deleteRefreshToken(refreshToken); // otherwise expired rows pile up forever
        throw new AppError(401, "Refresh token expired or invalid");
    }
    return signAccessToken(storedToken.userId);
}

export async function getCurrentUser(userId: number) {
    const user = await userRepo.findUserById(userId);
    if (!user) throw new AppError(404, "User not found");
    return user;
}

export async function logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
        await tokenRepo.deleteRefreshToken(refreshToken);
    }
}
