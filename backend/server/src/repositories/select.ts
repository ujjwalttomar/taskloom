// The only user fields ever sent to other people. Full rows also carry googleId and
// timestamps, and every include of a user goes out to all members of a board or workspace
// (in REST responses AND in WebSocket broadcasts), so always include users through this.
export const publicUser = { select: { id: true, name: true, email: true } } as const;
