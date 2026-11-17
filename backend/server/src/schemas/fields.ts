import { z } from "zod";

// Shared field rules. Before these, titles had no maximum length (megabytes could be
// stored and broadcast to every board member) and edit schemas accepted "" as a title.

/** Trimmed, non-empty, bounded. Used for titles and names (create AND edit). */
export const nameField = (label: string, max = 120) =>
    z.string()
        .trim()
        .min(1, `${label} is required`)
        .max(max, `${label} must be at most ${max} characters`);

export const descriptionField = z.string().max(5000, "Description must be at most 5000 characters");

export const commentTextField = z.string()
    .trim()
    .min(1, "Comment text is missing")
    .max(2000, "Comment must be at most 2000 characters");
