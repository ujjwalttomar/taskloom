import { z } from "zod";

export const CreateCommentSchema = z.object({
    body: z.object({
        text: z.string().min(1, "Comment text is missing"),
    }),
});

export const EditCommentSchema = z.object({
    body: z.object({
        text: z.string().min(1, "Comment text is missing"),
    }),
});
