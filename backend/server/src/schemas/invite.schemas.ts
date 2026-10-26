import { z } from "zod";

export const SendInviteSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email").min(1, "Email is required"),
        role: z.enum(["ADMIN", "EMPLOYEE"] as const).optional(),
    }),
});
