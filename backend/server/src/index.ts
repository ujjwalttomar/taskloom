import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.routes";
import boardRouter from "./routes/board.routes";
import commentRouter from "./routes/comment.routes";
import cardRouter from "./routes/card.routes";
import listRouter from "./routes/list.routes";
import workspaceRouter from "./routes/workspace.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));

app.use("/auth", authRouter);
app.use("/api", boardRouter);
app.use("/api", commentRouter);
app.use("/api", cardRouter);
app.use("/api", listRouter);
app.use("/api", workspaceRouter);

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
