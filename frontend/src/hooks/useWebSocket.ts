import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { WsEvent } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
const MAX_DELAY_MS = 30_000;

export type WsStatus = "connecting" | "live" | "reconnecting";

interface Options {
    /** Called after every successful RE-connect, so the page can refetch what it missed. */
    onReconnect?: () => void;
}

/**
 * One WebSocket per board page.
 * - Authenticates with a short-lived ticket from the REST API (the auth cookie is host-only
 *   and never reaches the WS server's host in production).
 * - Keeps retrying with backoff capped at 30s instead of giving up (a sleeping Render
 *   instance takes longer than the old 5-try budget to wake up).
 * - Reconnects immediately when the tab becomes visible again or the network comes back.
 */
export function useWebSocket(boardId: number | null, onEvent: (event: WsEvent) => void, options: Options = {}) {
    const [status, setStatus] = useState<WsStatus>("connecting");
    const wsRef = useRef<WebSocket | null>(null);
    const boardIdRef = useRef<number | null>(boardId);
    const onEventRef = useRef(onEvent);
    const onReconnectRef = useRef(options.onReconnect);

    // Keep the latest callbacks without reconnecting when they change
    useEffect(() => {
        onEventRef.current = onEvent;
        onReconnectRef.current = options.onReconnect;
    });

    useEffect(() => {
        let stopped = false;
        let connecting = false;
        let hasConnectedBefore = false;
        let retry = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const scheduleReconnect = () => {
            if (stopped) return;
            setStatus("reconnecting");
            const delay = Math.min(1000 * 2 ** retry, MAX_DELAY_MS);
            retry++;
            timer = setTimeout(connect, delay);
        };

        async function connect() {
            const state = wsRef.current?.readyState;
            if (stopped || connecting || state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
            connecting = true;
            if (timer) clearTimeout(timer);

            let ticket: string;
            try {
                // Also refreshes an expired access token on the way (api client handles 401 → refresh)
                ticket = (await api.auth.wsTicket()).ticket;
            } catch {
                connecting = false;
                scheduleReconnect();
                return;
            }
            if (stopped) return;

            const ws = new WebSocket(`${WS_URL}?ticket=${encodeURIComponent(ticket)}`);
            wsRef.current = ws;
            connecting = false;

            ws.onopen = () => {
                retry = 0;
                setStatus("live");
                if (boardIdRef.current !== null) {
                    ws.send(JSON.stringify({ type: "join", boardId: boardIdRef.current }));
                }
                if (hasConnectedBefore) onReconnectRef.current?.(); // resync events missed while offline
                hasConnectedBefore = true;
            };
            ws.onmessage = (event) => {
                try {
                    onEventRef.current(JSON.parse(event.data) as WsEvent);
                } catch {
                    // ignore malformed messages
                }
            };
            ws.onclose = () => scheduleReconnect();
            ws.onerror = () => ws.close();
        }

        // Back on the tab / back online → try right away instead of waiting out the backoff
        const reconnectNow = () => {
            if (document.visibilityState !== "visible") return;
            retry = 0;
            void connect();
        };
        document.addEventListener("visibilitychange", reconnectNow);
        window.addEventListener("online", reconnectNow);

        void connect();
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", reconnectNow);
            window.removeEventListener("online", reconnectNow);
            if (wsRef.current) {
                wsRef.current.onclose = null; // intentional close: don't reconnect
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, []);

    // Join/leave a room when the board changes
    useEffect(() => {
        boardIdRef.current = boardId;
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify(boardId !== null ? { type: "join", boardId } : { type: "leave" }));
    }, [boardId]);

    return status;
}
