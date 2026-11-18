// "dotenv/config" must be the FIRST import: imports run in order, before any code below,
// and app.ts (plus the modules it imports) reads process.env while loading.
import "dotenv/config";
import app from "./app";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!process.env.RESEND_API_KEY) console.warn("Email disabled: RESEND_API_KEY not set (invites still return a link)");
});
