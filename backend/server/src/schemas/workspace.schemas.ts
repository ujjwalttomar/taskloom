import { z } from "zod";

export const CreateWorkspaceSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Workspace name is required"),
        description: z.string().optional(),
    }),
});

export const EditWorkspaceSchema = z.object({
    body: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
    }),
});

export const AddWorkspaceMemberSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email").min(1, "Email is required"),
        role: z.enum(["ADMIN", "EMPLOYEE"] as const).optional(),
    }),
});

export const UpdateWorkspaceMemberRoleSchema = z.object({
    body: z.object({
        role: z.enum(["ADMIN", "EMPLOYEE"] as const),
    }),
});
