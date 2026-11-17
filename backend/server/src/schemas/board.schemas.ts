import { z } from "zod";
import { descriptionField, nameField } from "./fields";

export const CreateBoardSchema = z.object({
    body: z.object({
        title: nameField("Board title"),
        description: descriptionField.optional(),
    }),
});

export const EditBoardSchema = z.object({
    body: z.object({
        title: nameField("Board title").optional(),
        description: descriptionField.optional(),
    }),
});

export const AddBoardMemberSchema = z.object({
    body: z.object({
        email: z.string().trim().toLowerCase().min(1, "Email is required").email("Invalid email"),
        role: z.enum(["ADMIN", "EMPLOYEE"] as const).optional(),
    }),
});

export const UpdateBoardMemberRoleSchema = z.object({
    body: z.object({
        role: z.enum(["ADMIN", "EMPLOYEE"] as const),
    }),
});
