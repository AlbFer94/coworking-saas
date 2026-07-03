import  {Stripe} from 'stripe';

const stripeKey=process.env.STRIPE_SECRET_KEY!;

export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Inizializza istanza globale di Stripe

export const stripe = new Stripe(stripeKey, {
  apiVersion: '2026-06-24.dahlia' // L'SDK di Stripe richiede la specifica versione più aggiornata della API
});

