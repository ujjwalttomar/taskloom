/** Deterministic avatar colour for a name (same name → same colour). */
export function stringToColor(str: string): string {
    const palette = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#3b82f6", "#f97316"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length]!;
}
