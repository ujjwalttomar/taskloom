import { z } from "zod";
import { descriptionField, nameField } from "./fields";

export const CreateWorkspaceSchema = z.object({
    body: z.object({
        name: nameField("Workspace name"),
        description: descriptionField.optional(),
    }),
});

export const EditWorkspaceSchema = z.object({
    body: z.object({
        name: nameField("Workspace name").optional(),
        description: descriptionField.optional(),
    }),
});

export const AddWorkspaceMemberSchema = z.object({
    body: z.object({
        email: z.string().trim().toLowerCase().min(1, "Email is required").email("Invalid email"),
        role: z.enum(["ADMIN", "EMPLOYEE"] as const).optional(),
    }),
});

export const UpdateWorkspaceMemberRoleSchema = z.object({
    body: z.object({
        role: z.enum(["ADMIN", "EMPLOYEE"] as const),
    }),
});
