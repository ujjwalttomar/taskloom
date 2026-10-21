export async function sendEmail(to: string, subject: string, html: string) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn("RESEND_API_KEY not set — skipping email");
        return;
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "Taskloom <onboarding@resend.dev>",
            to,
            subject,
            html,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Resend error: ${JSON.stringify(err)}`);
    }
}
