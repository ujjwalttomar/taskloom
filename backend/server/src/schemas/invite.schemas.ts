import { z } from "zod";

export const SendInviteSchema = z.object({
    body: z.object({
        email: z.string().trim().toLowerCase().min(1, "Email is required").email("Invalid email"),
        role: z.enum(["ADMIN", "EMPLOYEE"] as const).optional(),
    }),
});
