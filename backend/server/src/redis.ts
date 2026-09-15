import Redis from "ioredis";

const publisher = new Redis();

export function publishBoardEvent(boardId: number, senderId: number, event: object) {
    publisher.publish(
        "board-events",
        JSON.stringify({ boardId, senderId, ...event })
    );
}
