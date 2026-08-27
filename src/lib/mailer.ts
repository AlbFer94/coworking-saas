import 'dotenv/config';
import nodemailer from 'nodemailer';


const transporter= nodemailer.createTransport({
    host:process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT ?? '587'),
    auth: {
        user:process.env.EMAIL_USER,
        pass:process.env.EMAIL_PASS
    },
});

interface EmailResult {
    emailSent: boolean;
    error?: string;
}

export async function sendConfirmationEmail(to: string, link: string): Promise<EmailResult> {
    try {
        await transporter.sendMail({
            from: `"Coworking-SaaS" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: "Conferma la tua registrazione",
            html: `<p style="margin-top: 20px;">Clicca sul link: <a href="${link}">per confermare la tua email</a></p>`
        });
        
        return { emailSent: true };
        
    } catch (error: any) {
        console.error("Nodemailer Error:", error);
        
        return { 
            emailSent: false, 
            error: error?.message || "Errore sconosciuto" 
        };
    }
}



