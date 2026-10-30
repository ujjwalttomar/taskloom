
import { BoardMember, WorkspaceMember } from "../../../shared/db/generated/prisma/client";

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