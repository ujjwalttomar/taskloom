// Re-export the Express app without calling .listen()
// This allows supertest to bind to a random port for testing.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.routes";
import boardRouter from "./routes/board.routes";
import commentRouter from "./routes/comment.routes";
import cardRouter from "./routes/card.routes";
import listRouter from "./routes/list.routes";
import workspaceRouter from "./routes/workspace.routes";
import inviteRouter from "./routes/invite.routes";
import { errorHandler } from "./middlewares/errorHandler";
import { AppError } from "./utils/AppError";
import { globalLimiter } from "./middlewares/rateLimiter";

const app = express();

app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));

// Global rate limiter (skip in test to avoid flaky tests)
if (process.env.NODE_ENV !== "test") {
    app.use(globalLimiter);
}

app.use("/auth", authRouter);
app.use("/api", boardRouter);
app.use("/api", commentRouter);
app.use("/api", cardRouter);
app.use("/api", listRouter);
app.use("/api", workspaceRouter);
app.use("/api", inviteRouter);

app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

app.use((req, _res, next) => {
    next(new AppError(404, `Cannot ${req.method} ${req.path}`));
});

app.use(errorHandler);

export default app;
