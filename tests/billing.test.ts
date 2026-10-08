import request from 'supertest';
import { app } from '../src/app.js';
import { describe, test, expect } from 'vitest';
import { memberA } from './setup.js';
import { stripe, webhookSecret } from '../src/stripe.js';



describe('Billing-test di caratterizzazione', () => {

    test('webhook deve ritornare status 400 e non trovare signature stripe valida', async () => {

        const rawPayload = '{"id":"evt_test","type":"customer.created"}';

        const res = await request(app)
            .post('/api/webhooks')
            .set('stripe-signature', 't=1,v1=fake')
            .set('Content-Type', 'application/json')
            .send(rawPayload);

        expect(res.status).toBe(400);
        expect(res.text).toContain('No signatures found matching');
    });

    test('Webhook: firma valida su evento non gestito → 200 { received: true }', async () => {
        // Evento volutamente NON 'invoice.paid': l'handler risponde 200 senza toccare il DB.
        const rawPayload = JSON.stringify({ id: 'evt_test_ok', object: 'event', type: 'customer.created' });

        // Firma HMAC calcolata con lo stesso secret che usa la rotta.
        // La stringa firmata e quella inviata devono essere IDENTICHE byte per byte.
        const signature = stripe.webhooks.generateTestHeaderString({
            payload: rawPayload,
            secret: webhookSecret,
        });

        const res = await request(app)
            .post('/api/webhooks')
            .set('stripe-signature', signature)
            .set('Content-Type', 'application/json')
            .send(rawPayload);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
    });

    test('Checkout rifiutato a un MEMBER', async () => {
        const res = await request(app)
            .post('/api/billing/checkout')
            .set('Authorization', `Bearer ${memberA.token}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toBe("Accesso negato.");
    });
});
