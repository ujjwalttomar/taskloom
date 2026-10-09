import Redis from "ioredis";

const publisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export function publishBoardEvent(boardId: number, senderId: number, event: object) {
    publisher.publish(
        "board-events",
        JSON.stringify({ boardId, senderId, ...event })
    );
}
