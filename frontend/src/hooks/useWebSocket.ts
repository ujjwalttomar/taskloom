import { useEffect, useRef, useCallback } from "react";
import type { WsEvent } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

export function useWebSocket(boardId: number | null, onEvent: (event: WsEvent) => void) {
    const wsRef = useRef<WebSocket | null>(null);
    const boardIdRef = useRef<number | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            if (boardIdRef.current !== null) {
                ws.send(JSON.stringify({ type: "join", boardId: boardIdRef.current }));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as WsEvent;
                onEventRef.current(data);
            } catch {
                // ignore malformed messages
            }
        };

        ws.onclose = () => {
            // Reconnect after 3 seconds
            reconnectTimer.current = setTimeout(() => {
                connect();
            }, 3000);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, []);

    // Connect on mount
    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect on intentional close
                wsRef.current.close();
            }
        };
    }, [connect]);

    // Join/leave room when boardId changes
    useEffect(() => {
        boardIdRef.current = boardId;
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        if (boardId !== null) {
            ws.send(JSON.stringify({ type: "join", boardId }));
        } else {
            ws.send(JSON.stringify({ type: "leave" }));
        }
    }, [boardId]);
}
