import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import Redis from "ioredis";
import dotenv from "dotenv";
import { verifyAccessToken, verifyWsTicket } from "../../shared/auth/token";
import prisma from "../../shared/db/client";

dotenv.config();

interface AuthenticatedSocket extends WebSocket {
    userId: number;
    boardId?: number;
    isAlive: boolean;
    joinSeq: number; // guards against out-of-order async join checks
}

const subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
// ioredis reconnects and re-subscribes on its own; just log instead of "Unhandled error event"
subscriber.on("error", (err) => console.error("[redis] subscriber error:", err.message));
const rooms = new Map<number, Set<AuthenticatedSocket>>();

const server = http.createServer();
// Clients only ever send tiny join/leave messages — no reason to accept the 100 MiB default
const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

function reject(socket: import("stream").Duplex, status: string) {
    socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
    socket.destroy();
}

/**
 * Who is connecting? Prefer a ?ticket= from GET /auth/ws-ticket (works when the WS server
 * is on a different host than the REST API, which is the case on Render). Fall back to the
 * accessToken cookie, which only reaches this server when both run on the same host (local dev).
 */
function authenticateUpgrade(req: http.IncomingMessage): number | null {
    try {
        const ticket = new URL(req.url ?? "/", "http://localhost").searchParams.get("ticket");
        if (ticket) return verifyWsTicket(ticket).userId;
        const token = parseCookies(req.headers.cookie || "")["accessToken"];
        if (token) return verifyAccessToken(token).userId;
    } catch {
        // invalid or expired token/ticket
    }
    return null;
}

server.on("upgrade", (req, socket, head) => {
    // Browsers always send Origin. Rejecting foreign origins stops other websites from
    // opening a socket with a visitor's cookie (cross-site WebSocket hijacking).
    const allowedOrigin = process.env.FRONTEND_URL;
    if (allowedOrigin && req.headers.origin && req.headers.origin !== allowedOrigin) {
        return reject(socket, "403 Forbidden");
    }

    const userId = authenticateUpgrade(req);
    if (!userId) return reject(socket, "401 Unauthorized");

    wss.handleUpgrade(req, socket, head, (ws) => {
        const authSocket = ws as AuthenticatedSocket;
        authSocket.userId = userId;
        authSocket.isAlive = true;
        authSocket.joinSeq = 0;
        wss.emit("connection", authSocket);
    });
});

wss.on("connection", (ws: AuthenticatedSocket) => {
    console.log(`User ${ws.userId} connected`);
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (data) => {
        let message: { type?: unknown; boardId?: unknown };
        try {
            message = JSON.parse(data.toString());
        } catch {
            return; // ignore malformed messages
        }
        if (message.type === "join" && typeof message.boardId === "number") {
            await handleJoin(ws, message.boardId);
        }
        if (message.type === "leave") {
            ws.joinSeq++; // cancel any join still being checked
            leaveRoom(ws);
        }
    });

    ws.on("close", () => {
        leaveRoom(ws);
        console.log(`User ${ws.userId} disconnected`);
    });
});

/** Only board members may join a board's room (previously any logged-in user could). */
async function handleJoin(ws: AuthenticatedSocket, boardId: number) {
    const seq = ++ws.joinSeq;
    let isMember = false;
    try {
        const membership = await prisma.boardMember.findUnique({
            where: { boardId_memberId: { boardId, memberId: ws.userId } },
        });
        isMember = !!membership;
    } catch (err) {
        console.error("[ws] membership check failed:", (err as Error).message);
    }
    // A newer join/leave arrived while we were checking — that one wins
    if (seq !== ws.joinSeq || ws.readyState !== WebSocket.OPEN) return;

    if (!isMember) {
        ws.send(JSON.stringify({ type: "join_denied", boardId }));
        return;
    }
    joinRoom(ws, boardId);
    console.log(`User ${ws.userId} joined board ${boardId}`);
}

function joinRoom(ws: AuthenticatedSocket, boardId: number) {
    leaveRoom(ws);
    if (!rooms.has(boardId)) rooms.set(boardId, new Set());
    const room = rooms.get(boardId)!;
    room.add(ws);
    ws.boardId = boardId;

    // Broadcast user_joined_board to all OTHER sockets in the room
    const joinedEvent = JSON.stringify({ type: "user_joined_board", userId: ws.userId });
    for (const socket of room) {
        if (socket !== ws && socket.readyState === WebSocket.OPEN) {
            socket.send(joinedEvent);
        }
    }

    // Send board_presence back to the joining socket with ALL currently online userIds
    const onlineUserIds = Array.from(new Set(Array.from(room).map((s) => s.userId)));
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "board_presence", onlineUserIds }));
    }
}

function leaveRoom(ws: AuthenticatedSocket) {
    if (ws.boardId !== undefined) {
        const room = rooms.get(ws.boardId);
        if (room) {
            room.delete(ws);

            // Only broadcast user_left_board if this user has NO other sockets in the room
            const userStillPresent = Array.from(room).some((s) => s.userId === ws.userId);
            if (!userStillPresent) {
                const leftEvent = JSON.stringify({ type: "user_left_board", userId: ws.userId });
                for (const socket of room) {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(leftEvent);
                    }
                }
            }

            if (room.size === 0) rooms.delete(ws.boardId);
        }
        ws.boardId = undefined;
    }
}

subscriber.subscribe("board-events", (err) => {
    if (err) {
        console.error("Failed to subscribe to Redis:", err);
    } else {
        console.log("Subscribed to board-events channel");
    }
});

subscriber.on("message", (channel, message) => {
    try {
        const event = JSON.parse(message.toString());
        const { boardId, senderId, ...payload } = event;

        const room = rooms.get(boardId);
        if (!room) return;

        for (const socket of room) {
            if (socket.userId !== senderId && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(payload));
            }
        }

        // Access was revoked: after telling them (so the UI can leave), stop sending them events
        if (payload.type === "member_removed") {
            for (const socket of [...room]) {
                if (socket.userId === payload.memberId) leaveRoom(socket);
            }
        }
        if (payload.type === "board_deleted") {
            for (const socket of [...room]) leaveRoom(socket);
        }
    } catch {
        // ignore malformed messages
    }
});

// Heartbeat: terminate sockets that stopped answering pings (dead network, sleeping laptop),
// otherwise they linger in rooms forever and idle proxies drop the connection silently.
const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
        const ws = client as AuthenticatedSocket;
        if (!ws.isAlive) {
            ws.terminate();
            continue;
        }
        ws.isAlive = false;
        ws.ping();
    }
}, 30_000);

function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        if (name) cookies[name] = rest.join("=");
    });
    return cookies;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`WS server running on port ${PORT}`);
});

// Render sends SIGTERM on every deploy: close sockets cleanly (1001 = going away) so
// clients reconnect straight away instead of waiting for a timeout.
function shutdown() {
    clearInterval(heartbeat);
    for (const client of wss.clients) client.close(1001, "Server restarting");
    server.close();
    Promise.allSettled([subscriber.quit(), prisma.$disconnect()]).finally(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
