import { Router } from "express";
import { requireAuth, checkRole } from '../middlewares/auth.js';
import type { Request, Response } from 'express';
import { stripe, webhookSecret } from '../stripe.js';
import { prisma } from "../prisma.js";



export const billingRouter = Router();

//Rotta di Chechout gestita con Stripe, protetta con middleware requireAuth e accessibile solo ai TENANTADMIN
billingRouter.post("/api/billing/checkout", requireAuth, checkRole(['TENANTADMIN']), async (req: Request, res: Response) => {

    try {
        //recupero del tenantId da requireAuth che popola il claim dal DB
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(403).json({ error: "Identificativo azienda (Tenant) non consentito al pagamento" })
        }

        //Creazione sessione di checkout di Stripe
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID!,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: "http://localhost:3000/api/billing/success",
            cancel_url: "http://localhost:3000/api/billing/cancel",
            metadata: {
                tenantId: tenantId
            },
        });

        return res.status(200).json({ message: "Sessione checkout creata con successo", checkoutUrl: session.url });
    } catch (error) {
        console.error('Errore nel pagamento', error);
        return res.status(500).json({ error: "Errore interno durante il tentativo di pagamento" });
    }
});

// ATTENZIONE: questo handler richiede il body GREZZO (Buffer) per verificare la firma Stripe.
// Va registrato con express.raw() PRIMA di express.json(): vedi la registrazione in app.ts.
// Il vincolo è protetto da tests/billing.test.ts.
export async function stripeWebhookHandler(req: Request, res: Response) {

    //Intercetta la signature inviata da Stripe
    const signature = req.headers['stripe-signature'];

    if (!signature) {
        return res.status(400).json({ error: "Firma Stripe mancante." });
    }


    let event;


    try {
        //Controlla che la richiesta provenga davvero da Stripe
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error: any) {
        console.error(`Errore validazione firma: ${error.message}`);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    //Intercetta gli eventi asincroni di Stripe
    try {
        if (event.type === 'invoice.paid') {
            const invoice = event.data.object as any;

            //estrazione di tenantId dai metadati restituiti da Stripe
            const tenantId = invoice.subscription_details?.metadata?.tenantId || invoice.metadata?.tenantId;

            if (!tenantId) {
                console.error("webhook ricevuto ma nessun tenantId trovato nei metadati");
                return res.status(400).json({ error: "tenantId mancante nei metadati di Stripe" })
            }

            console.log(` Ricevuto pagamento per il Tenant ID: ${tenantId}`);

            //Aggiornamento dello status per il Tenant (Azienda) che ha pagato
            const updatedTenant = await prisma.tenant.update({
                where: { id: tenantId },
                data: { status: "ACTIVE" }
            });

            console.log(`Tenant ${updatedTenant.name} attivato con successo`);
        }

        return res.status(200).json({ received: true });

    } catch (error) {
        console.error("Errore interno durante l'elaborazione del webhook", error);
        return res.status(500).json({ error: "Errore interno del server." });
    }
}
