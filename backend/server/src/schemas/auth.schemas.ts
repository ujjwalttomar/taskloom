import { z } from "zod";

export const GoogleCallbackSchema = z.object({
    query: z.object({
        code: z.string().min(1, "Authorization code missing"),
        state: z.string().min(1, "OAuth state missing"),
    }),
});
