# Taskloom

A real-time, multi-user kanban app: **workspaces → boards → lists → cards**, with comments, assignees and role-based access. When someone moves a card, everyone looking at that board sees it move, without refreshing.

- **Sign in with Google.** No passwords are stored.
- **Two levels of membership.** Workspace admins invite people; board admins decide who is on each board.
- **Live updates.** Cards, lists, comments, assignees and members update for everyone on the board. You can also see who else has the board open.
- **Drag and drop** for cards (within a list and between lists) and for lists.
- **Invites by email**, or as a copyable link when email isn't set up.

---

## How it fits together

```
                 ┌──────────────────────────┐
  Browser ──────►│  React SPA (Vite)        │  Vercel
  (React)        └──────────────────────────┘
     │  REST + cookies                     ▲  WebSocket (?ticket=…)
     ▼                                     │
┌──────────────────────┐  publish   ┌──────┴─────────────────┐
│ REST API (Express 5) │ ─────────► │ WebSocket server (ws)  │  Render × 2
│ auth, rules, writes  │   Redis    │ rooms per board        │
└─────────┬────────────┘  pub/sub   └──────┬─────────────────┘
          │            (Upstash)           │ checks board membership
          ▼                                ▼
                  PostgreSQL via Prisma  (Supabase)
```

1. Every change goes through the **REST API**. It checks permissions, writes to Postgres, then publishes an event such as `{ boardId, type: "card_moved", card }` to the Redis channel `board-events`.
2. The **WebSocket server** subscribes to that channel and forwards each event to the sockets in that board's room, skipping the user who made the change.
3. The **browser** applies the event to its state. After a reconnect it reloads the board, so missed events don't matter.

**Why two servers?** HTTP requests are stateless, while WebSockets are long-lived connections. Keeping them apart means a deploy of the API doesn't drop every live connection, and each part can be scaled on its own. Redis is the only link between them.

**Why WS tickets?** The auth cookie belongs to the API's host, and browsers never send it to the separately hosted WS server. So the browser first asks the API for a **60-second ticket** (`GET /auth/ws-ticket`) and opens `wss://…?ticket=…`. On every `join`, the WS server checks the database to confirm that the user is a member of that board.

---

## Tech stack

| Part | Built with |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router, dnd-kit |
| REST API | Node.js, Express 5, TypeScript (run with `tsx`), zod, express-rate-limit |
| Real-time | `ws` (plain WebSockets, no Socket.IO), Redis pub/sub via ioredis |
| Database | PostgreSQL, Prisma 6 |
| Auth | Google OAuth 2.0, JWT access token (15 min) + DB refresh token (7 days), httpOnly cookies |
| Email | Resend (optional) |
| Tests | Vitest + Supertest |

---

## Repository layout

```
taskloom/
├── frontend/                    React SPA
│   └── src/
│       ├── api/client.ts        every API call; token refresh; error messages
│       ├── context/             AuthContext (current user)
│       ├── hooks/useWebSocket   live connection: tickets, reconnect, status
│       ├── pages/               Login, Dashboard, Board, Invite
│       ├── components/          List (+ cards), CardModal, UserCardModal
│       └── types/               shared types, incl. the WsEvent union
└── backend/
    ├── server/                  REST API
    │   ├── src/
    │   │   ├── app.ts           the Express app (no listen, so tests can import it)
    │   │   ├── index.ts         loads env, starts listening
    │   │   ├── routes/          URL → middleware chain → controller
    │   │   ├── middlewares/     auth, workspace/board roles, rate limits, errors
    │   │   ├── controllers/     HTTP in/out only
    │   │   ├── services/        the business rules
    │   │   ├── repositories/    all Prisma queries
    │   │   ├── schemas/         zod validation
    │   │   └── redis.ts         publishBoardEvent()
    │   └── tests/               Vitest + Supertest
    ├── ws/src/server.ts         WebSocket server
    └── shared/
        ├── auth/                JWT helpers (access tokens, WS tickets)
        └── db/                  Prisma schema + client (used by server AND ws)
```

The backend is split into layers: **route → middleware → controller → service → repository**. Each layer only talks to the one below it.

---

## Running it locally

### 1. What you need
- **Node 20+**
- **PostgreSQL**. Docker is simplest: `docker run -d --name taskloom-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17`
- **Redis** on `localhost:6379`, e.g. `docker run -d --name taskloom-redis -p 6379:6379 redis:7`
- **A Google OAuth client** (see [Google sign-in](#google-sign-in))

### 2. Install
Each package has its own `node_modules`, and that includes `shared/auth` and `shared/db`. Node resolves their imports from their own folders, so skipping them breaks both servers.
```bash
cd backend/shared/auth && npm install
cd ../db && npm install
cd ../../server && npm install
cd ../ws && npm install
cd ../../frontend && npm install
```

### 3. Configure
```bash
cp backend/server/.env.example backend/server/.env
cp backend/ws/.env.example     backend/ws/.env
cp frontend/.env.example       frontend/.env
```
Then fill in the values. Each file explains every variable. The important points:
- `JWT_SECRET` must be **identical** in `server/.env` and `ws/.env`.
- `DATABASE_URL` goes in **both** backend files, because the WS server checks board membership.
- Locally, `DIRECT_URL` can be the same as `DATABASE_URL`.

### 4. Create the database tables
```bash
cd backend/server
npx prisma generate --schema=../shared/db/prisma/schema.prisma
npx prisma db push  --schema=../shared/db/prisma/schema.prisma
```

### 5. Run (three terminals)
```bash
cd backend/server && npm run dev     # REST API  → http://localhost:3000
cd backend/ws     && npm run dev     # WebSocket → ws://localhost:3001
cd frontend       && npm run dev     # App       → http://localhost:5173
```

### Google sign-in
1. Go to Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (type: Web application).
2. Add the **Authorized redirect URI** `http://localhost:3000/auth/google/callback`. It must match `GOOGLE_REDIRECT_URI` exactly.
3. Put the client ID and secret into `backend/server/.env`.
4. While the consent screen is in **Testing** mode, only the test users you list can sign in.

---

## Tests

| Where | What | How to run |
|---|---|---|
| `backend/server/tests/` | **82 integration and unit tests** through the real Express app and a real Postgres database. They cover permissions, every role rule, the OAuth callback, refresh tokens, invites, card ordering and rate limits. | `cd backend/server && npm test` |
| `frontend/src/api/client.test.ts` | **10 tests** for the API client: one shared token refresh, session expiry, error messages | `cd frontend && npm test` |

The backend tests need their **own** database. Copy `backend/server/.env.test.example` to `.env.test` and point it at a local database whose name ends in `_test`. The test config refuses to run against anything else, so the tests can't touch Supabase or your dev data. The tables are created automatically, and nothing is ever deleted.

Redis, email and Google's code exchange are mocked. Everything else, including the database, is real.

---

## Who can do what

| Action | Who |
|---|---|
| Create a workspace | any signed-in user (they become its admin) |
| Rename/delete a workspace, invite people, change roles, remove members | workspace **admin** |
| Create a board | any workspace member (they become its admin) |
| Open a board, add/rename lists, create/edit/move cards, comment | board **member** |
| Rename/delete a board, add/remove board members, change board roles, delete lists | board **admin** |
| Assign / unassign a card | yourself; board admins can do it for anyone |
| Edit a comment | its author |
| Delete a comment | its author or a board admin |

Two more rules:
- The last admin of a workspace or board can't be demoted or removed.
- Removing someone from a workspace also removes them from all of its boards.

---

## API

All endpoints except auth and invite details are under `/api` and require login (the `accessToken` cookie). Errors always look like `{ "message": "…" }`.

<details>
<summary><b>Auth</b></summary>

| Method | Path | |
|---|---|---|
| GET | `/auth/google?returnTo=/path` | start Google login (sets a short-lived `state` cookie) |
| GET | `/auth/google/callback` | Google redirects here; sets the auth cookies and redirects to `returnTo` |
| GET | `/auth/me` | current user |
| GET | `/auth/ws-ticket` | 60-second ticket for opening the WebSocket |
| POST | `/auth/refresh` | new access token from the refresh cookie |
| POST | `/auth/logout` | revoke the refresh token, clear the cookies |
</details>

<details>
<summary><b>Workspaces and invites</b></summary>

| Method | Path | Needs |
|---|---|---|
| GET / POST | `/api/workspaces` | login |
| GET | `/api/workspaces/:workspaceId` | member |
| PATCH / DELETE | `/api/workspaces/:workspaceId` | admin |
| PATCH / DELETE | `/api/workspaces/:workspaceId/members/:memberId` | admin |
| GET | `/api/workspaces/:workspaceId/members/:memberId/profile` | workspace admin |
| POST | `/api/workspaces/:workspaceId/invites` | admin (`{ email, role? }`: existing users are added directly, everyone else gets an invite link) |
| GET | `/api/invites/:token` | public (the token is the secret) |
| POST | `/api/invites/:token/accept` | login, with the invited email |
</details>

<details>
<summary><b>Boards and lists</b></summary>

| Method | Path | Needs |
|---|---|---|
| GET / POST | `/api/workspaces/:workspaceId/boards` | workspace member |
| GET | `/api/boards/:boardId` | board member (returns lists, cards, assignees, members) |
| PATCH / DELETE | `/api/boards/:boardId` | board admin |
| POST | `/api/boards/:boardId/members` | board admin (`{ email, role? }`, must be in the workspace) |
| PATCH / DELETE | `/api/boards/:boardId/members/:memberId` | board admin |
| GET | `/api/boards/:boardId/members/:memberId/profile` | board member |
| GET / POST | `/api/boards/:boardId/lists` | board member |
| PATCH | `/api/boards/:boardId/lists/:listId` | board member |
| DELETE | `/api/boards/:boardId/lists/:listId` | board admin |
| PATCH | `/api/boards/:boardId/lists/:listId/order` | board member (`{ afterListId?, beforeListId? }`) |
</details>

<details>
<summary><b>Cards and comments</b></summary>

| Method | Path | Needs |
|---|---|---|
| GET / POST | `/api/lists/:listId/cards` | board member |
| GET / PATCH / DELETE | `/api/cards/:cardId` | board member |
| PATCH | `/api/cards/:cardId/move` | board member (`{ targetListId, afterCardId?, beforeCardId? }`) |
| POST | `/api/cards/:cardId/assign` | board member (`{ userId }`, yourself unless admin) |
| DELETE | `/api/cards/:cardId/assign/:userId` | yourself, or a board admin |
| GET / POST | `/api/cards/:cardId/comments` | board member |
| PATCH | `/api/comments/:commentId` | the author |
| DELETE | `/api/comments/:commentId` | the author or a board admin |
</details>

**Ordering.** Lists and cards have a float `order`. A move sends the neighbours it should land between, and the server stores the midpoint. So a move updates one row instead of renumbering the whole list.

**Rate limits** (per IP, in memory):

| Applies to | Limit |
|---|---|
| everything under `/api` | 300 requests / 15 min |
| starting a Google login | 30 / 15 min |
| sending invites | 20 / hour |

---

## Real-time protocol

**Client → server:**
- `{ "type": "join", "boardId": 5 }`
- `{ "type": "leave" }`

**Server → client:**
- **Presence:** `board_presence`, `user_joined_board`, `user_left_board`
- **Access refused:** `join_denied` (you aren't a member of that board)
- **Board changes:**
  - board: `board_edited`, `board_deleted`
  - lists: `list_created`, `list_edited`, `list_deleted`, `list_reordered`
  - cards: `card_created`, `card_edited`, `card_deleted`, `card_moved`, `card_assigned`, `card_unassigned`
  - comments: `comment_created`, `comment_edited`, `comment_deleted`
  - members: `member_added`, `member_role_updated`, `member_removed`

**Connection handling:**
- The server pings every 30 s and drops dead connections.
- The client reconnects forever, backing off up to 30 s, and reloads the board after reconnecting.

---

## Deploying

The current setup is **Vercel** (frontend), **two Render web services** (API and WS), **Supabase** (Postgres) and **Upstash** (Redis).

| Service | Build | Start | Env |
|---|---|---|---|
| API (`backend/server`) | `cd ../shared/auth && npm install && cd ../db && npm install && npx prisma generate && cd ../../server && npm install` | `npm start` | everything in `server/.env.example`, with `NODE_ENV=production` |
| WS (`backend/ws`) | `npm install && npm run build` | `npm start` | `JWT_SECRET`, `REDIS_URL`, `DATABASE_URL`, `FRONTEND_URL` |
| Frontend | `npm run build` | static (`dist/`) | `VITE_API_URL`, `VITE_WS_URL` |

The API's build command deliberately avoids `npm run build`. That script ends with `tsc` (a type-check only, the code runs through `tsx`), and `typescript` is a devDependency, which `npm install` skips when `NODE_ENV=production`.

Things that break production if they're wrong:
- **Supabase:** the runtime `DATABASE_URL` uses the transaction pooler (port 6543) **with `?pgbouncer=true`**. Free projects pause after about a week of inactivity.
- **Upstash:** the URL must be `rediss://` (TLS).
- **The two Render services** must share the same `JWT_SECRET` and `REDIS_URL`.
- **`FRONTEND_URL`** must equal the Vercel origin exactly: no trailing slash, and preview URLs won't match.
- **`VITE_*` variables** are baked in at build time, so redeploy the frontend after changing them. `VITE_WS_URL` must be `wss://`.

---

## Known limitations

- **Safari, Firefox and Brave** block the API's cookies when the frontend and API are on different sites (`vercel.app` vs `onrender.com`), which causes a login loop. The fix is to proxy `/api` and `/auth` through Vercel rewrites, so the cookies become first-party.
- **No committed migrations.** The schema is applied with `prisma db push`.
- **Rate limits live in memory,** so they're per instance and reset on restart. Use a Redis store before running more than one API instance.
- **Your own other tabs** don't receive live updates for changes you make, because the WS server skips the author by user, not by tab.
- **Card and list orders** are never renormalized. After many inserts into the same gap, the order values eventually stop being distinct.
