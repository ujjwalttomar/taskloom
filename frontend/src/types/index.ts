export interface User {
    id: number;
    name: string;
    email: string;
    googleId?: string;
    createdAt: string;
}

export interface Workspace {
    id: number;
    name: string;
    description?: string;
    createdAt: string;
    members: WorkspaceMember[];
    boards?: Board[];
}

export interface WorkspaceMember {
    workspaceId: number;
    memberId: number;
    role: "ADMIN" | "EMPLOYEE";
    user?: User;
}

export interface Board {
    id: number;
    title: string;
    description?: string;
    workspaceId: number;
    createdAt: string;
    members: BoardMember[];
    lists?: List[];
}

export interface BoardMember {
    boardId: number;
    memberId: number;
    role: "ADMIN" | "EMPLOYEE";
    user?: User;
}

export interface List {
    id: number;
    title: string;
    order: number;
    boardId: number;
    cards: Card[];
}

export interface Card {
    id: number;
    title: string;
    description?: string;
    order: number;
    listId: number;
    creatorId?: number;
    createdAt: string;
    creator?: User;
    assignedTo?: AssignedCard[];
    comments?: Comment[];
    list?: List;
}

export interface AssignedCard {
    cardId: number;
    userId: number;
    user?: User;
}

export interface Comment {
    id: number;
    text: string;
    cardId: number;
    creatorId?: number;
    createdAt: string;
    updatedAt: string;
    creator?: User;
}

export type WsEvent =
    | { type: "board_edited"; board: Board }
    | { type: "board_deleted"; boardId: number }
    | { type: "list_created"; list: List }
    | { type: "list_edited"; list: List }
    | { type: "list_deleted"; listId: number }
    | { type: "list_reordered"; list: List }
    | { type: "card_created"; card: Card }
    | { type: "card_edited"; card: Card }
    | { type: "card_deleted"; cardId: number }
    | { type: "card_moved"; card: Card }
    | { type: "card_assigned"; cardId: number; assignment: AssignedCard }
    | { type: "card_unassigned"; cardId: number; userId: number }
    | { type: "comment_created"; comment: Comment }
    | { type: "comment_edited"; comment: Comment }
    | { type: "comment_deleted"; commentId: number }
    | { type: "member_added"; member: BoardMember }
    | { type: "member_role_updated"; member: BoardMember }
    | { type: "member_removed"; memberId: number };
