
import dotenv from "dotenv";
dotenv.config();

import prisma from "../../../shared/db/client";
import app from "./app";

const PORT = process.env.PORT || 3000;

// ── Health check for DB (kept here — needs prisma) ──────────────────────────
app.get("/health/db", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
