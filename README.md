# Taskloomm

A real-time collaborative project management tool built with Node.js, WebSocket, and Redis Pub/Sub. Think Trello — workspaces, boards, lists, cards, and comments — with changes reflected instantly across all connected clients.

---

## Architecture

```
┌─────────────┐     HTTP REST      ┌──────────────────┐
│   Frontend  │ ─────────────────► │  Express Server  │
│   (React)   │                    │   (port 3000)    │
│             │ ◄───────────────── │                  │
│             │                    └────────┬─────────┘
│             │                             │ publish
│             │                    ┌────────▼─────────┐
│             │   WebSocket        │      Redis        │
│             │ ◄────────────────► │  Pub/Sub bridge  │
│             │                    └────────┬─────────┘
└─────────────┘                             │ subscribe
                                   ┌────────▼─────────┐
                                   │  WebSocket Server │
                                   │   (port 3001)     │
                                   └──────────────────┘
```

**Why two servers?** HTTP and WebSocket have fundamentally different scaling characteristics. HTTP is stateless (scale horizontally easily). WebSocket is stateful (each server holds open connections). Separating them lets you scale each independently. Redis Pub/Sub acts as the message bus between them — HTTP server publishes events after DB mutations, WS server subscribes and broadcasts to connected clients.

---

## Tech Stack

| Layer | Technology |
|---|---|
| HTTP Server | Node.js, Express 5, TypeScript |
| WebSocket Server | Node.js, `ws` library (raw, no Socket.IO) |
| Database | PostgreSQL + Prisma ORM |
| Message Bus | Redis Pub/Sub (ioredis) |
| Authentication | Google OAuth 2.0, JWT, httpOnly cookies |
| Shared Packages | Custom monorepo packages (`@taskloom/auth`, `@taskloom/db`) |

---

## Project Structure

```
taskloom/
├── backend/
│   ├── server/                 ← Express HTTP server
│   │   └── src/
│   │       ├── index.ts
│   │       ├── redis.ts        ← publishBoardEvent utility
│   │       ├── controllers/    ← business logic
│   │       ├── routes/         ← route definitions
│   │       ├── middlewares/    ← auth, board auth, resolvers
│   │       └── types/          ← Express request augmentation
│   ├── ws/                     ← WebSocket server
│   │   └── src/
│   │       └── server.ts       ← connection auth, rooms, Redis subscriber
│   └── shared/
│       ├── auth/               ← JWT sign/verify, token types
│       └── db/                 ← Prisma client singleton, schema
└── README.md
```

---

## Database Schema

```
User ──< WorkspaceMember >── Workspace ──< Board ──< List ──< Card
                                              │                  │
                                          BoardMember        AssignedCard
                                                             Comment
```

10 models: `User`, `RefreshToken`, `Workspace`, `WorkspaceMember`, `Board`, `BoardMember`, `List`, `Card`, `AssignedCard`, `Comment`.

Cascade deletes throughout — deleting a workspace removes all boards, lists, cards, and comments atomically.

---

## Authentication

- **Google OAuth 2.0** — no passwords stored
- **Access token**: JWT, 15-minute expiry, stored in httpOnly cookie
- **Refresh token**: 64-char random hex, 7-day expiry, stored in DB + httpOnly cookie
- **WebSocket auth**: Cookie sent automatically on upgrade handshake, verified before connection is established

---

## Key Design Decisions

### Resolver Middleware Pattern
Cards and comments don't carry `boardId` in their URLs (`/cards/:cardId`, not `/boards/:boardId/cards/:cardId`). But `isBoardMember` middleware needs a `boardId`. Resolver middleware traverses the DB (Card → List → Board) and sets `req.params.boardId` before the auth check runs.

### Fractional Indexing
Lists and cards use a `Float` `order` field. Reordering inserts a midpoint value between two existing orders: `(afterOrder + beforeOrder) / 2`. Only one DB write per reorder, regardless of list size. No shifting of adjacent items.

### Role-Based Access Control
Two-level RBAC:
- **Workspace level**: ADMIN or EMPLOYEE (stored on `WorkspaceMember`)
- **Board level**: ADMIN or EMPLOYEE (stored on `BoardMember`)

Roles are on junction tables, not on users — a user can be admin of workspace A and employee of workspace B simultaneously.

### Lazy OAuth Client Initialization
`OAuth2Client` is initialized lazily (on first request) instead of at module load time. ES module imports are hoisted and execute before `dotenv.config()`, so env vars would be `undefined` at module initialization. Lazy init ensures env vars are loaded before the client is created.

### WebSocket Rooms
In-memory `Map<boardId, Set<AuthenticatedSocket>>`. When a user opens a board, the frontend sends `{ type: "join", boardId }`. On navigation away, it sends `{ type: "leave" }`. On disconnect, the socket is cleaned up automatically. Events are only sent to sockets in the matching room, and the sender is excluded (they already see their own changes).

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| GET | `/auth/google` | Redirect to Google OAuth |
| GET | `/auth/google/callback` | OAuth callback, sets cookies |
| GET | `/auth/me` | Get current user |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Clear cookies, revoke refresh token |

### Workspaces
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/workspaces` | User | Get all joined workspaces |
| POST | `/api/workspaces` | User | Create workspace |
| GET | `/api/workspaces/:id` | Member | Get workspace details |
| PATCH | `/api/workspaces/:id` | Admin | Edit workspace |
| DELETE | `/api/workspaces/:id` | Admin | Delete workspace |
| POST | `/api/workspaces/:id/members` | Admin | Add member by email |
| PATCH | `/api/workspaces/:id/members/:memberId` | Admin | Update member role |
| DELETE | `/api/workspaces/:id/members/:memberId` | Admin | Remove member |

### Boards
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/workspaces/:id/boards` | Member | List boards |
| POST | `/api/workspaces/:id/boards` | Admin | Create board |
| GET | `/api/boards/:boardId` | Board Member | Get board with lists+cards |
| PATCH | `/api/boards/:boardId` | Board Admin | Edit board |
| DELETE | `/api/boards/:boardId` | Board Admin | Delete board |
| POST | `/api/boards/:boardId/members` | Board Admin | Add board member |
| PATCH | `/api/boards/:boardId/members/:memberId` | Board Admin | Update board member role |
| DELETE | `/api/boards/:boardId/members/:memberId` | Board Admin | Remove board member |

### Lists
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/boards/:boardId/lists` | Board Member | Get all lists |
| POST | `/api/boards/:boardId/lists` | Board Member | Create list |
| PATCH | `/api/boards/:boardId/lists/:listId` | Board Member | Edit list |
| DELETE | `/api/boards/:boardId/lists/:listId` | Board Member | Delete list |
| PATCH | `/api/boards/:boardId/lists/:listId/order` | Board Member | Reorder list |

### Cards
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/lists/:listId/cards` | Board Member | Get all cards in list |
| POST | `/api/lists/:listId/cards` | Board Member | Create card |
| GET | `/api/cards/:cardId` | Board Member | Get card with comments+assignees |
| PATCH | `/api/cards/:cardId` | Board Member | Edit card |
| DELETE | `/api/cards/:cardId` | Board Member | Delete card |
| PATCH | `/api/cards/:cardId/move` | Board Member | Move card to another list |
| POST | `/api/cards/:cardId/assignees` | Board Member* | Assign user to card |
| DELETE | `/api/cards/:cardId/assignees/:userId` | Board Member | Unassign user |

*Members can only self-assign. Admins can assign anyone.

### Comments
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/cards/:cardId/comments` | Board Member | Get all comments |
| POST | `/api/cards/:cardId/comments` | Board Member | Add comment |
| PATCH | `/api/comments/:commentId` | Creator only | Edit comment |
| DELETE | `/api/comments/:commentId` | Creator or Board Admin | Delete comment |

---

## Real-time Events

The WebSocket server broadcasts the following events to all board members except the sender:

| Event Type | Triggered By |
|---|---|
| `board_edited` | Board title/description updated |
| `board_deleted` | Board deleted |
| `list_created` | New list added |
| `list_edited` | List renamed |
| `list_deleted` | List removed |
| `list_reordered` | List moved |
| `card_created` | New card added |
| `card_edited` | Card title/description updated |
| `card_deleted` | Card removed |
| `card_moved` | Card moved between lists |
| `card_assigned` | User assigned to card |
| `card_unassigned` | User removed from card |
| `comment_created` | Comment added |
| `comment_edited` | Comment updated |
| `comment_deleted` | Comment removed |
| `member_added` | New board member added |
| `member_role_updated` | Board member role changed |
| `member_removed` | Board member removed |

---

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL
- Redis

### 1. Clone and install dependencies

```bash
git clone https://github.com/yourusername/taskloom.git
cd taskloom

cd backend/shared/auth && npm install
cd ../db && npm install
cd ../../server && npm install
cd ../ws && npm install
```

### 2. Configure environment variables

```bash
cp backend/server/.env.example backend/server/.env
cp backend/ws/.env.example backend/ws/.env
```

Fill in your values in `backend/server/.env`:
```
PORT=3000
NODE_ENV=development
JWT_SECRET=<random-string>
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://user:password@localhost:5432/taskloom
```

Fill in `backend/ws/.env`:
```
WS_PORT=3001
JWT_SECRET=<same-secret-as-server>
```

### 3. Set up the database

```bash
cd backend/shared/db
npx prisma migrate dev
npx prisma generate
```

### 4. Start Redis

```bash
redis-server
```

### 5. Run the servers

```bash
# Terminal 1 — HTTP server
cd backend/server && npm run dev

# Terminal 2 — WebSocket server
cd backend/ws && npm run dev
```

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID (Web application)
4. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy Client ID and Client Secret to your `.env`
