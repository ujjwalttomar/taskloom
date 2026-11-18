# Taskloom frontend

The React SPA for Taskloom. Setup, architecture and deployment are in the [root README](../README.md).

```bash
npm install
cp .env.example .env      # VITE_API_URL, VITE_WS_URL (baked in at build time)
npm run dev               # http://localhost:5173
npm test                  # API client tests (Vitest)
npm run build             # type-check + production build into dist/
```

Where things live:
- `src/api/client.ts`: every API call, the token refresh and error messages
- `src/hooks/useWebSocket.ts`: the live connection
- `src/pages/BoardPage.tsx`: the board, drag and drop, and live events
