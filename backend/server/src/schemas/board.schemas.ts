import { z } from "zod";

export const CreateBoardSchema = z.object({
    body: z.object({
        title: z.string().min(1, "Board title is missing"),
        description: z.string().optional(),
    }),
});

export const EditBoardSchema = z.object({
    body: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
    }),
});

export const AddBoardMemberSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email").min(1, "Email is required"),
        role: z.enum(["ADMIN", "EMPLOYEE"] as const).optional(),
    }),
});

export const UpdateBoardMemberRoleSchema = z.object({
    body: z.object({
        role: z.enum(["ADMIN", "EMPLOYEE"] as const),
    }),
});
