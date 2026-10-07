import { Router } from 'express';
import { prisma } from '../prisma.js';
import { supabase } from '../supabase.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireActiveSubscription } from '../middlewares/billing.js';
import { isExclusionViolationError } from '../lib/errors.js'; // Importa la funzione di type guard
import type { Request, Response } from 'express';




export const bookingsRouter = Router();

//Rotta di prenotazione stanza(Room) con controllo di sovrapposizione prenotazioni e decremento dei crediti dell'utente in una transazione atomica.
//Controllo Appartenenza: La Room richiesta deve appartenere al tenant del chiamante.
bookingsRouter.post("/api/bookings", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {

    const { roomId, startTime, endTime, name, email, phone } = req.body;

    if (!roomId || !startTime || !endTime || !name || !email || !phone) {
        return res.status(400).json({ error: "Campi obbligatori mancanti." });
    }

    try {

        //Crea oggetto Date
        const start = new Date(startTime);
        const end = new Date(endTime);

        //Recupera l'id dello user che effettua la prenotazione
        const userId = req.user?.id;

        //Recupero del tenantId da requireAuth che popola l'identità dal DB
        const tenantId = req.user?.tenantId;

        //La GUARD requireAuth garantisce che req.user sia definito, inserisco controllo se Typescript non sa che requireAuth è passato o se la rotta venisse montata senza middleware.
        if (!tenantId) {
            return res.status(403).json({ error: "Identificativo azienda non trovato." });
        }

        if (!userId) {
            return res.status(403).json({ error: "Identificativo utente non trovato." });
        }

        // Controllo di appartenenza. roomId arriva dal body ed è quindi
        // arbitrario: senza questa verifica un utente potrebbe prenotare una
        // stanza di un'altra azienda, marcando il record col proprio tenantId
        // e occupando la stanza altrui. Sul percorso Express + Prisma le policy
        // RLS non si applicano (connessione con ruolo BYPASSRLS e senza JWT),
        // quindi questo controllo è l'unico isolamento esistente.
        const room = await prisma.room.findUnique({
            where: { id: Number(roomId) },
            select: { tenantId: true },
        });

        // Stanza inesistente e stanza di un altro tenant danno la stessa
        // risposta: distinguerle rivelerebbe quali roomId esistono nel sistema.
        // Il confronto copre entrambi i casi perché su stanza assente
        // room?.tenantId è undefined, mentre tenantId è garantito dalla guardia sopra.
        if (tenantId !== room?.tenantId) {
            return res.status(404).json({ error: "La stanza selezionata non esiste" });
        }

        if (start >= end) {
            return res.status(400).json({ error: "L'orario di inizio deve essere precedente a quello di fine." });
        }


        //Controllo di sovrapposizione prenotazioni (anti-overlapping) solo per Fail Fast, il vero blocco è su constraint di esclusione in Postgres
        const overlappingBooking = await prisma.booking.findFirst({
            //Il controllo viene fatto solo su roomId in quanto l'appartenenza della room al tenant viene eseguita prima nella rotta.
            where: {
                roomId: Number(roomId), //controlla la stessa stanza
                AND: [
                    {
                        startTime: {
                            lt: end //l'inizio della nuova richiesta prenotazione è prima della fine di una prenotazione esistente
                        }
                    },
                    {
                        endTime: {
                            gt: start //la fine della nuova richiesta prenotazione è dopo l'inizio di una prenotazione esistente
                        }
                    }
                ]
            }
        });

        if (overlappingBooking) {
            return res.status(400).json({ error: "Impossibile prenotare. La stanza è già occupata in questo intervallo di tempo." });
        }


        //Controllo dei crediti dell'utente e creazione della prenotazione in una transazione atomica
        const newBooking = await prisma.$transaction(async (tx) => {

            const creditBalance = await tx.user.updateMany({
                where: {
                    id: userId,
                    deletedAt: null,
                    credits: { gt: 0 } //controlla che l'utente abbia crediti disponibili
                },
                data: {
                    credits: { decrement: 1 }
                }
            });

            if (creditBalance.count === 0) {
                throw new Error("CREDITO_INSUFFICENTE");
            }

            //Crea la prenotazione direttamente nel contesto della transazione
            const booking = await tx.booking.create({
                data: {
                    roomId: Number(roomId),
                    startTime: start,
                    endTime: end,
                    name,
                    email,
                    phone,
                    tenantId: tenantId,
                    userId: userId
                }
            });

            return booking;
        });

        // Invia un evento in tempo reale tramite Supabase per notificare la nuova prenotazione, isolato includendo il tenantId
        const realTimechannel = supabase.channel(`bookings:${tenantId}`);

        try {

            //Invia il messaggio in broadcast a tutti i frontend in ascolto
            await realTimechannel.httpSend('new-booking', { booking: newBooking }) //invia i dettagli della prenotazione appena creata.


        } catch (error) {
            console.error("Notifica realTime non inviata correttamente:", error);
        }

        try {
            await supabase.removeChannel(realTimechannel);
        } catch (error) {
            console.error("Errore durante la pulizia del channel realTime:", error);
        }




        return res.status(201).json({ message: "Prenotazione creata con successo", booking: newBooking });
    } catch (error) {
        console.error('Errore creazione prenotazione', error);
        if (isExclusionViolationError(error) && error.cause.code === '23P01') {
            return res.status(409).json({ error: "Impossibile prenotare. La stanza è già occupata in questo intervallo di tempo." });
        } else if (error instanceof Error && error.message === 'CREDITO_INSUFFICENTE') {
            return res.status(400).json({ error: "Credito insufficente per effettuare la prenotazione." });
        } else {
            return res.status(500).json({ error: 'Errore interno durante la creazione della prenotazione.' });
        }
    }
});

//Rotta di lettura delle prenotazione per storico e gestione. 
//Rotetta con requireAuth e requireActiveSubscription. 
//Gli utenti vedono solo le proprie prenotazioni, gli admin vedono tutte le prenotazioni del tenant.
bookingsRouter.get("/api/bookings", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {

    try {
        const tenantId = req.user?.tenantId;
        const userId = req.user?.id;

        if (!tenantId) {
            return res.status(403).json({ error: "Identificativo azienda (Tenant) non trovato." });
        }

        if (!userId) {
            return res.status(403).json({ error: "Identificativo utente non trovato." });
        }

        //Branch di ramificazione per ruolo: gli admin vedono tutte le prenotazioni del proprio tenant, i member vedono solo le proprie.
        const whereClause = req.user?.role === 'TENANTADMIN'
            ? { tenantId }
            : { tenantId, userId };

        const bookings = await prisma.booking.findMany({
            where: whereClause,
            orderBy: { startTime: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                startTime: true,
                endTime: true,
                status: true,
                createdAt: true,
                room: { select: { name: true } }
            },
        });

        return res.status(200).json({ bookings });
    } catch (error) {
        console.error("Errore del recupero bookings", error);
        return res.status(500).json({ error: "Errore durante il recupero dati delle prenotazioni." })
    }
});





