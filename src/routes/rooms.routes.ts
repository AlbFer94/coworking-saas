import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, checkRole } from '../middlewares/auth.js';
import { requireActiveSubscription } from '../middlewares/billing.js';
import type { Request, Response } from 'express';


export const roomsRouter = Router();

// Rotta di creazione stanze, protetta con middleware requireAuth e accessibile solo ai TENANTADMIN
roomsRouter.post("/api/rooms", requireAuth, checkRole(['TENANTADMIN']), requireActiveSubscription, async (req: Request, res: Response) => {
    const { name, price, duration } = req.body;

    //Validazione base dei dati in arrivo
    if (!name || price === undefined || !duration) {
        return res.status(400).json({ error: "Specificare nome della stanza, prezzo e durata " });
    }

    try {
        //Recupero del tenantId che requireAuth popola dal DB.
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(403).json({ error: "Identificativo azienda (Tenant) non trovato." });
        }

        //Salva la nuova stanza associandola al tenantId
        const newRoom = await prisma.room.create({
            data: {
                name,
                price: Number(price), //Assicura che sia un Float/Number
                duration: Number(duration), //Assicura che sia un Int/Number
                tenantId
            }
        });

        return res.status(201).json({ message: 'Stanza creata  con successo', room: newRoom });
    } catch (error) {
        console.error('Errore creazione stanza', error);
        return res.status(500).json({ error: 'Errore interno durante la creazione stanza.' });
    }
});

//Rotta di lettura stanze del proprio tenant, mostra le fascie orarie occupate da fornire al frontend per il booking.
roomsRouter.get("/api/rooms", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {

    const now = new Date();

    try {
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            return res.status(403).json({ error: "Identificativo azienda (tenant) non trovato." });
        }

        //Recupera le stanze del tenant filtrando le prenotazioni attive su ogni stanza, se la stanza è libera l'array bookings ritorna vuoto, bookings [].
        const rooms = await prisma.room.findMany({
            where: { tenantId: tenantId },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                price: true,
                duration: true,
                bookings: {  //Scendo nella relazione booking per recuperare le prenotazioni attive.
                    where: {
                        status: { in: ['PENDING', 'APPROVED'] },
                        endTime: { gte: now },
                    },
                    select: {
                        startTime: true,
                        endTime: true,
                    },
                },
            },
        });

        return res.status(200).json({ rooms: rooms });

    } catch (error) {
        console.error('Errore recupero stanze.', error);
        return res.status(500).json({ error: 'Errore interno durante il recupero delle stanze dal database.' });
    }
});
