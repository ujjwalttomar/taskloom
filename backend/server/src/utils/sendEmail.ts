import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

export async function sendEmail(to: string, subject: string, html: string) {
    await transporter.sendMail({
        from: `"Taskloom" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
    });
}
