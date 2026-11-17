import { z } from "zod";
import { nameField } from "./fields";

export const CreateListSchema = z.object({
    body: z.object({
        title: nameField("List title"),
    }),
});

export const EditListSchema = z.object({
    body: z.object({
        title: nameField("List title"),
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
