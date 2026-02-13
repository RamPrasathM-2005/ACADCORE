// services/mailService.js
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

export const sendMail = async ({ to, subject, text, html }) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.MAIL_USER,
            to,
            subject,
            text,
            html
        });
        return info;
    } catch (error) {
        console.error("Email sending failed:", error);
        throw error;
    }
};