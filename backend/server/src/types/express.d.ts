import { BoardMember, WorkspaceMember } from "@prisma/client";

declare global {
    namespace Express {
        interface Request {
            userId?: number;
            membership?: WorkspaceMember;
            boardMembership?: BoardMember;
        }
    }
}

export {};
