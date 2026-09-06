import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

export const requireActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
        return res.status(401).json({ error: 'Accesso negato. Identificativo azienda non trovato.' });
    }

    try {
        // Recupera la colonna status dal database 
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { status: true }
        });

        // Controllo di sicurezza: se il tenant non esiste o non è attivo, blocca la chiamata
        if (!tenant || tenant.status !== "ACTIVE") {
            return res.status(402).json({ 
                error: 'Payment Required', 
                message: 'Il tuo abbonamento non è attivo o è scaduto. Completa il pagamento per sbloccare la funzionalità.'});
        }

        // passa alla prossima middleware
        return next();

    } catch (error) {
        console.error("Errore nel middleware Paywall:", error);
        return res.status(500).json({ error: 'Errore interno del server durante la verifica del piano.' });
    }
};
