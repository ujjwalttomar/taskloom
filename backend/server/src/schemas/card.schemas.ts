import { z } from "zod";

export const CreateCardSchema = z.object({
    body: z.object({
        title: z.string().min(1, "Card title is missing"),
        description: z.string().optional(),
    }),
});

export const EditCardSchema = z.object({
    body: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
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
