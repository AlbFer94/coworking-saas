import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { roomsRouter } from './routes/rooms.routes.js';
import { bookingsRouter } from './routes/bookings.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { billingRouter, stripeWebhookHandler } from './routes/billing.routes.js';


export const app=express();
export const PORT=process.env.PORT||3000;

// Webhook Stripe: DEVE restare prima di express.json(), serve il body grezzo per la firma.
app.post("/api/webhooks", express.raw({type:'application/json'}), stripeWebhookHandler);

//middleware CORS
const corsOrigin=process.env.CORS_ORIGIN;

if(!corsOrigin){
    throw new Error("CORS_ORIGIN non definita. Impostala nel file .env.");
}

app.use(cors({origin:corsOrigin}));

app.use(express.json());
app.use(authRouter); // Rotte di identità: registrazione fondatore, signup membri, /api/me.
app.use(roomsRouter); // Monta il router delle stanze
app.use(bookingsRouter); //Monta il router per le bookings.
app.use(billingRouter); // Monta la rotta di checkout Stripe.



