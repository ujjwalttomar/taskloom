
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import prisma from "../../../shared/db/client";
import authRouter from "./routes/auth.routes";
import boardRouter from "./routes/board.routes";
import commentRouter from "./routes/comment.routes";
import cardRouter from "./routes/card.routes";
import listRouter from "./routes/list.routes";
import workspaceRouter from "./routes/workspace.routes";
import inviteRouter from "./routes/invite.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin : process.env.FRONTEND_URL || "http://localhost:5173",
    credentials : true
}));

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

app.get("/health/db", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});


app.listen(PORT, ()=>{
    console.log(`servers is running at${PORT}`);
});