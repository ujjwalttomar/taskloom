import { describe, it, expect, vi, beforeEach } from "vitest";
import { anon, createUser, prisma } from "./helpers";
import { AppError } from "../src/utils/AppError";
import * as authService from "../src/services/auth.service";

// Google itself can't be called from tests, so only the code-for-tokens exchange is mocked.
// Everything Taskloom does around it (state check, cookies, redirects) runs for real.
vi.mock("../src/services/auth.service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/services/auth.service")>()),
    handleGoogleLogin: vi.fn(),
}));
const handleGoogleLogin = vi.mocked(authService.handleGoogleLogin);

const FRONTEND = "http://localhost:5173";

/** Start a login and return the oauth_state cookie + the state that was sent to Google. */
async function startLogin(returnTo?: string) {
    const res = await anon().get("/auth/google").query(returnTo ? { returnTo } : {}).expect(302);
    const google = new URL(res.headers.location!);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("oauth_state="))!;
    const saved = JSON.parse(decodeURIComponent(cookie.split(";")[0]!.slice("oauth_state=".length)).replace(/^j:/, ""));
    return { google, cookie: cookie.split(";")[0]!, saved };
}

describe("GET /auth/google (M2, H9)", () => {
    it("redirects to Google with a random state, stored in a short-lived httpOnly cookie", async () => {
        const { google, cookie, saved } = await startLogin();
        expect(google.hostname).toBe("accounts.google.com");
        expect(google.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
        expect(google.searchParams.get("prompt")).toBe("select_account");
        expect(saved.state).toBe(google.searchParams.get("state"));
        expect(cookie).toBeTruthy();
    });

    it("keeps a relative returnTo (so an invite survives login)", async () => {
        expect((await startLogin("/invite/abc123")).saved.returnTo).toBe("/invite/abc123");
    });

    it.each(["//evil.example", "https://evil.example", "/\\evil.example"])("replaces the open-redirect attempt %s with /dashboard", async (target) => {
        expect((await startLogin(target)).saved.returnTo).toBe("/dashboard");
    });
});

describe("GET /auth/google/callback", () => {
    // Braces matter: a function RETURNED from beforeEach is run as a cleanup hook after the test,
    // and mockReset() returns the mock itself, so `() => mock.mockReset()` would call the mock.
    beforeEach(() => {
        handleGoogleLogin.mockReset();
    });

    it("user pressed Cancel → back to the app with authError=cancelled", async () => {
        const res = await anon().get("/auth/google/callback?error=access_denied").expect(302);
        expect(res.headers.location).toBe(`${FRONTEND}/?authError=cancelled`);
    });

    it("no state cookie (login CSRF attempt) → invalid_state, Google never called", async () => {
        const res = await anon().get("/auth/google/callback?code=attacker-code&state=abc").expect(302);
        expect(res.headers.location).toBe(`${FRONTEND}/?authError=invalid_state`);
        expect(handleGoogleLogin).not.toHaveBeenCalled();
    });

    it("state that doesn't match the cookie → invalid_state", async () => {
        const { cookie } = await startLogin();
        const res = await anon().get("/auth/google/callback?code=x&state=wrong").set("Cookie", cookie).expect(302);
        expect(res.headers.location).toBe(`${FRONTEND}/?authError=invalid_state`);
    });

    it("success → sets both auth cookies and redirects to returnTo", async () => {
        handleGoogleLogin.mockResolvedValue({ accessToken: "access-jwt", refreshToken: "refresh-token" });
        const { cookie, saved } = await startLogin("/invite/abc123");
        const res = await anon().get(`/auth/google/callback?code=good&state=${saved.state}`).set("Cookie", cookie).expect(302);
        expect(handleGoogleLogin).toHaveBeenCalledWith("good");
        expect(res.headers.location).toBe(`${FRONTEND}/invite/abc123`);
        const cookies = (res.headers["set-cookie"] as unknown as string[]).join("\n");
        expect(cookies).toMatch(/accessToken=access-jwt;.*HttpOnly/);
        expect(cookies).toMatch(/refreshToken=refresh-token;.*HttpOnly/);
    });

    it("unverified Google email → authError=unverified_email", async () => {
        handleGoogleLogin.mockRejectedValue(new AppError(403, "Email not verified"));
        const { cookie, saved } = await startLogin();
        const res = await anon().get(`/auth/google/callback?code=x&state=${saved.state}`).set("Cookie", cookie).expect(302);
        expect(res.headers.location).toBe(`${FRONTEND}/?authError=unverified_email`);
    });

    it("any other failure → authError=login_failed (no raw JSON error page)", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        handleGoogleLogin.mockRejectedValue(new Error("invalid_grant"));
        const { cookie, saved } = await startLogin();
        const res = await anon().get(`/auth/google/callback?code=x&state=${saved.state}`).set("Cookie", cookie).expect(302);
        expect(res.headers.location).toBe(`${FRONTEND}/?authError=login_failed`);
    });
});

describe("refresh tokens (M11)", () => {
    const addToken = async (userId: number, msFromNow: number) => {
        const token = `rt-${Date.now()}-${Math.random()}`;
        await prisma.refreshToken.create({ data: { token, userId, expiresAt: new Date(Date.now() + msFromNow) } });
        return token;
    };

    it("a valid refresh token issues a new access cookie", async () => {
        const user = await createUser();
        const token = await addToken(user.id, 60_000);
        const res = await anon().post("/auth/refresh").set("Cookie", `refreshToken=${token}`).expect(200);
        expect((res.headers["set-cookie"] as unknown as string[]).join()).toMatch(/accessToken=/);
    });

    it("an expired refresh token → 401, and its row is deleted", async () => {
        const user = await createUser();
        const token = await addToken(user.id, -60_000);
        await anon().post("/auth/refresh").set("Cookie", `refreshToken=${token}`).expect(401);
        expect(await prisma.refreshToken.findUnique({ where: { token } })).toBeNull();
    });

    it("no refresh cookie → 401", async () => {
        await anon().post("/auth/refresh").expect(401);
    });

    it("logout deletes the refresh token", async () => {
        const user = await createUser();
        const token = await addToken(user.id, 60_000);
        await anon().post("/auth/logout").set("Cookie", `refreshToken=${token}`).expect(200);
        expect(await prisma.refreshToken.findUnique({ where: { token } })).toBeNull();
    });
});
