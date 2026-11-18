import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { escapeHtml } from "../src/utils/escapeHtml";
import { parseId } from "../src/utils/parseId";
import { handleError } from "../src/utils/handleError";
import { AppError } from "../src/utils/AppError";
import { buildInviteEmail } from "../src/services/invite.service";
import { Prisma } from "../../shared/db/generated/prisma/client";
import { signAccessToken, verifyAccessToken, signWsTicket, verifyWsTicket } from "../../shared/auth/token";

// Small pure functions: no database, no HTTP.

describe("escapeHtml", () => {
    it("escapes the five HTML-special characters", () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    });
});

describe("buildInviteEmail (M10: HTML injection in invite emails)", () => {
    it("renders a malicious workspace name as text, not as a link or script", () => {
        const html = buildInviteEmail(`<a href="https://evil.example">Reset password</a><script>x()</script>`, "EMPLOYEE", "http://app/invite/abc");
        expect(html).not.toContain(`<a href="https://evil.example"`);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
        expect(html).toContain(`href="http://app/invite/abc"`); // the real button still works
    });
});

describe("parseId (M1: bad ids become 400, not a Prisma crash)", () => {
    it.each(["abc", "0", "-3", "1.5", "", undefined])("rejects %j", (value) => {
        expect(() => parseId(value, "board id")).toThrow(AppError);
    });
    it("accepts positive integers", () => {
        expect(parseId("42")).toBe(42);
    });
});

describe("handleError (M1: one error shape, sensible status codes)", () => {
    const fakeRes = () => {
        const res = { status: vi.fn(), json: vi.fn() };
        res.status.mockReturnValue(res);
        return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
    };
    const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "test" });

    it.each([
        [new AppError(403, "Nope"), 403, "Nope"],
        [prismaError("P2025"), 404, "Not found"],
        [prismaError("P2002"), 409, "Already exists"],
        [prismaError("P2003"), 400, "Referenced record does not exist"],
    ])("maps %s", (error, status, message) => {
        const res = fakeRes();
        handleError(res, error);
        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.json).toHaveBeenCalledWith({ message });
    });

    it("hides unknown errors behind a generic 500", () => {
        const res = fakeRes();
        vi.spyOn(console, "error").mockImplementation(() => {});
        handleError(res, new Error("secret internals"));
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
    });
});

describe("tokens (H2: WS tickets and access tokens can't stand in for each other)", () => {
    it("a WS ticket is not accepted as an access token", () => {
        expect(() => verifyAccessToken(signWsTicket(1))).toThrow();
    });
    it("an access token is not accepted as a WS ticket", () => {
        expect(() => verifyWsTicket(signAccessToken(1))).toThrow();
    });
    it("each verifies as its own kind", () => {
        expect(verifyAccessToken(signAccessToken(7)).userId).toBe(7);
        expect(verifyWsTicket(signWsTicket(7)).userId).toBe(7);
    });
});
