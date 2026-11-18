
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
import inviteRouter from "./routes/invite.routes";
import { notFound, errorHandler } from "./middlewares/errorHandler";
import { apiLimiter } from "./middlewares/rateLimiter";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Render (and most hosts) sit behind one proxy hop. Without this every request would
// appear to come from the proxy's IP, and the rate limiter would treat all users as one.
app.set("trust proxy", 1);

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin : process.env.FRONTEND_URL || "http://localhost:5173",
    credentials : true
}));

app.use("/api", apiLimiter);
app.use("/auth", authRouter);
app.use("/api", boardRouter);
app.use("/api", commentRouter);
app.use("/api", cardRouter);
app.use("/api", listRouter);
app.use("/api", workspaceRouter);
app.use("/api", inviteRouter);


app.get("/health", (req, res)=>{
    res.status(200).json({status : "ok"});
});

// Must stay last: JSON 404 for unknown routes, then the central error handler
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!process.env.RESEND_API_KEY) console.warn("Email disabled: RESEND_API_KEY not set (invites still return a link)");
});
