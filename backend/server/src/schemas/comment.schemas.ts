import { z } from "zod";
import { commentTextField } from "./fields";

export const CreateCommentSchema = z.object({
    body: z.object({
        text: commentTextField,
    }),
});

export const EditCommentSchema = z.object({
    body: z.object({
        text: commentTextField,
    }),
});
