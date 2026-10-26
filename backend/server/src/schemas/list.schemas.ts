import { z } from "zod";

export const CreateListSchema = z.object({
    body: z.object({
        title: z.string().min(1, "List title is missing"),
    }),
});

export const EditListSchema = z.object({
    body: z.object({
        title: z.string().min(1, "Title is required"),
    }),
});

export const ChangeListOrderSchema = z.object({
    body: z
        .object({
            afterListId: z.number().int().positive().optional(),
            beforeListId: z.number().int().positive().optional(),
        })
        .refine((d) => d.afterListId !== undefined || d.beforeListId !== undefined, {
            message: "Provide afterListId or beforeListId",
        }),
});
