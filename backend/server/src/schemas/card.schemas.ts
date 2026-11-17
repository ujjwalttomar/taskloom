import { z } from "zod";
import { descriptionField, nameField } from "./fields";

export const CreateCardSchema = z.object({
    body: z.object({
        title: nameField("Card title", 200),
        description: descriptionField.optional(),
    }),
});

export const EditCardSchema = z.object({
    body: z.object({
        title: nameField("Card title", 200).optional(),
        description: descriptionField.optional(),
    }),
});

export const MoveCardSchema = z.object({
    body: z.object({
        targetListId: z.number({ message: "targetListId is required" }).int().positive(),
        afterCardId: z.number().int().positive().optional(),
        beforeCardId: z.number().int().positive().optional(),
    }),
});

export const AssignCardSchema = z.object({
    body: z.object({
        userId: z.number({ message: "userId is required" }).int().positive(),
    }),
});
