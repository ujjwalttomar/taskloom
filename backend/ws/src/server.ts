import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import Redis from "ioredis";
import dotenv from "dotenv";
import { verifyAccessToken } from "../../shared/auth/token";

dotenv.config();

interface AuthenticatedSocket extends WebSocket {
    userId: number;
    boardId?: number;
}

const subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const rooms = new Map<number, Set<AuthenticatedSocket>>();

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies["accessToken"];

    if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
    }

    try {
        const decoded = verifyAccessToken(token);
        wss.handleUpgrade(req, socket, head, (ws) => {
            const authSocket = ws as AuthenticatedSocket;
            authSocket.userId = decoded.userId;
            wss.emit("connection", authSocket);
        });
    } catch {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
    }
});

wss.on("connection", (ws: AuthenticatedSocket) => {
    console.log(`User ${ws.userId} connected`);

    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === "join" && typeof message.boardId === "number") {
                joinRoom(ws, message.boardId);
                console.log(`User ${ws.userId} joined board ${message.boardId}`);
            }
            if (message.type === "leave") {
                leaveRoom(ws);
                console.log(`User ${ws.userId} left board`);
            }
        } catch {
            // ignore malformed messages
        }
    });

    ws.on("close", () => {
        leaveRoom(ws);
        console.log(`User ${ws.userId} disconnected`);
    });
});

function joinRoom(ws: AuthenticatedSocket, boardId: number) {
    leaveRoom(ws);
    if (!rooms.has(boardId)) rooms.set(boardId, new Set());
    rooms.get(boardId)!.add(ws);
    ws.boardId = boardId;
}

function leaveRoom(ws: AuthenticatedSocket) {
    if (ws.boardId !== undefined) {
        const room = rooms.get(ws.boardId);
        if (room) {
            room.delete(ws);
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
    } catch {
        // ignore malformed messages
    }
});

function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        if (name) cookies[name] = rest.join("=");
    });
    return cookies;
}

const PORT = process.env.WS_PORT || 3001;
server.listen(PORT, () => {
    console.log(`WS server running on port ${PORT}`);
});
