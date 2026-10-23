export async function sendEmail(to: string, subject: string, html: string) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn("RESEND_API_KEY not set — skipping email");
        return;
    }

    const from = process.env.EMAIL_FROM || "Taskloom <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html }),
    });

    const body = await res.text();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
    console.log(`Resend accepted email to ${to}: ${body}`);
}
