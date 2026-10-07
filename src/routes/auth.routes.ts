import { Router } from 'express';
import { prisma } from '../prisma.js';
import { supabaseAdmin } from "../supabase.js";
import { requireAuth } from '../middlewares/auth.js';
import { sendConfirmationEmail } from '../lib/mailer.js';
import { Prisma, type Tenant, type User } from '../../generated/prisma/index.js';
import type { Request, Response } from 'express';


export const authRouter = Router();

// registrazione nuova azienda di co-working
authRouter.post("/api/tenants", async (req, res) => {

    const { firstName, lastName, email, password, slug, name } = req.body;

    if (!firstName || !slug || !lastName || !email || !password || !name) {
        return res.status(400).json({ error: "Per favore, compila tutti i campi" });
    }

    try {
        const slugChecker = await prisma.tenant.findUnique({
            where: {
                slug,
            },
        });

        if (slugChecker) {
            return res.status(409).json({ error: 'Questo codice azienda è già in uso.', code: "SLUG_ALREADY_EXISTS" });
        }

        const emailChecker = await prisma.user.findUnique({
            where: {
                email,
            },
        });

        if (emailChecker) {
            //il messaggio di errore è volutamente generico.non conferma che l'email sia registrata. 
            // In signup è esplicito (EMAIL_UNCONFIRMED /EMAIL_ALREADY_REGISTERED) perché lì l'informazione sblocca un percorso
            // reale — login o recupero password.
            return res.status(409).json({
                error: "non è possibile registrare un nuovo spazio con questa email; se hai già un account, accedi — per aprire un nuovo spazio usa un'altra email",
                code: "FOUNDER_REGISTRATION_REFUSED"
            });
        }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
        });

        //Supabase non lancia errori intercettabili da catch ma vanno intercettati esplicitamente
        if (authError) {
            console.error("Errore createUser fondatore", authError.message);
            return res.status(409).json({
                error: "non è possibile registrare un nuovo spazio con questa email; se hai già un account, accedi — per aprire un nuovo spazio usa un'altra email",
                code: "FOUNDER_REGISTRATION_REFUSED"
            });
        }

        if (!authData?.user) {
            return res.status(500).json({ error: "Utente Supabase non disponibile." });
        }

        const founderAuthId = authData.user.id;

        let result: { tenant: Tenant, founder: User };

        try {
            result = await prisma.$transaction(async (tx) => {

                const newTenant = await tx.tenant.create({
                    data: {
                        name,
                        slug,
                    },
                });

                const newFounder = await tx.user.create({
                    data: {
                        id: founderAuthId,
                        firstName,
                        lastName,
                        email,
                        role: "TENANTADMIN",
                        tenantId: newTenant.id
                    },
                });

                return { tenant: newTenant, founder: newFounder };

            });

        } catch (error) {

            console.error("Errore transazione creazione tenant + fondatore:", error);
            // Pulizia best-effort dell'utente Auth:(niente Tenant, niente User), ma Supabase è fuori dal confine tx e non
            // viene annullato. Si cancella per sub e MAI per email: nella race TOCTOU
            // l'utente dell'altra richiesta ha la stessa email ma sub diverso.
            // DEBITO NOTO: se la pulizia fallisce, l'orfano Auth sopravvive e
            // REGISTRATION_FAILED_RETRY promette un retry che sbatterà su
            // users_email_partial_key.
            try {
                await supabaseAdmin.auth.admin.deleteUser(founderAuthId);
            } catch (deleteError) {
                console.error("Errore durante il tentativo di eliminare l'utente:", deleteError);
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === "P2002") {
                    return res.status(409).json({ error: "Questo codice azienda è già in uso.", code: "SLUG_ALREADY_EXISTS" });
                }
            }

            return res.status(500).json({ error: "Errore durante la creazione del tenant e del fondatore.", code: "REGISTRATION_FAILED_RETRY" });
        }

        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email: email,
            password: password
        });

        if (linkError) {
            return res.status(201).json({
                message: "Utente registrato, ma non è possibile generare il link di conferma",
                user: result.founder,
                tenant: result.tenant,
                code: "LINK_GENERATION_FAILED"

            })
        }

        const emailResult = await sendConfirmationEmail(email, linkData.properties.action_link);

        return res.status(201).json({
            message: emailResult.emailSent
                ? "Utente registrato ed email di conferma inviata."
                : "Utente registrato, ma non è stato possibile inviare l'email di conferma.",
            user: result.founder,
            tenant: result.tenant,
            emailSent: emailResult.emailSent,
            ...(emailResult.error && { code: "EMAIL_SEND_FAILED" })
        });

    } catch (error) {
        console.error("Errore durante la creazione del tenant:", error);
        return res.status(500).json({ error: "Errore durante la registrazione.", code: "FOUNDER_REGISTRATION_FAILED" });
    }
});

// Registrazione utente/amministratore con Auth Supabase e Prisma per il db
authRouter.post("/api/auth/signup", async (req, res) => {

    const { firstName, lastName, email, password, slug } = req.body;

    if (!firstName || !lastName || !email || !password || !slug) {
        return res.status(400).json({ error: "Campi obligatori mancanti." });
    }

    try {
        //Risoluzione slug -> tenant.
        const tenant = await prisma.tenant.findUnique({
            where: {
                slug: slug,
            },
        });

        if (!tenant) {
            return res.status(400).json({ error: "Codice invito non valido", code: "INVALID_TENANT_SLUG" })
        }

        const tenantId = tenant.id;

        // Fonte di verità per l'esistenza dell'email: Prisma, non Supabase.
        // Il record User viene creato in Prisma allo stesso momento in cui
        // viene creato su Supabase Auth (vedi ramo "else" sotto), quindi
        // una query qui basta a sapere se l'email è già nota al sistema,
        // senza dover interrogare Supabase (che non offre un getUserByEmail).
        const isRegistered = await prisma.user.findUnique({
            where: {
                email: email,
            },
        });

        if (isRegistered) {
            // RAMO 2/3 — email già presente in Prisma.
            // admin.createUser() darebbe lo stesso errore generico "email
            // già esistente" sia per un utente confermato che per uno non
            // confermato: qui invece li distinguo esplicitamente
            // leggendo email_confirmed_at da Supabase Auth, perché il
            // comportamento corretto per il frontend è diverso nei due casi
            // (blocco secco vs. suggerire il recupero password).
            const userId = isRegistered.id;
            const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            if (!data.user.email_confirmed_at) {
                // RAMO 3 — email registrata ma mai confermata. Con controllo su truthiness: copre sia null che undefined.
                // Non si aggiorna né si ricrea nulla (evita l'asimmetria
                // password/metadata scoperta in test precedenti): si blocca
                // e si segnala il code, così il frontend può guidare l'utente
                // al recupero password invece di un errore generico.
                return res.status(409).json({ error: "Utente già registrato recuperare la password", code: "EMAIL_UNCONFIRMED" });
            }

            else {
                // RAMO 2 — email registrata e confermata: nessuna azione,
                // l'utente deve semplicemente fare login.
                return res.status(409).json({ error: "Utente già esistente effettuare Login", code: "EMAIL_ALREADY_REGISTERED" });
            }
        }

        else {
            // RAMO 1 — email non presente in Prisma: registrazione nuova.
            // admin.createUser() (Admin API, service role) al posto di
            // signUp() lato client: a differenza di signUp(), non applica
            // l'anti-enumeration (qui non serve, è una chiamata server-side
            // privilegiata) e soprattutto NON invia l'email di conferma da
            // sola — va gestita esplicitamente altrove nel flusso.
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                user_metadata: { firstName, lastName, tenantId, role: "MEMBER" }
            });

            //Supabase non lancia errori intercettabili da catch ma vanno intercettati esplicitamente
            if (authError) {
                return res.status(400).json({ error: authError.message });
            }

            if (!authData?.user) {
                return res.status(500).json({ error: "Utente Supabase non disponibile." });
            }

            //salvataggio nuovo user nel db
            const newUser = await prisma.user.create({
                data: {
                    id: authData.user.id, //Sincronizza ID Prisma con quello Supabase
                    firstName,
                    lastName,
                    email,
                    tenantId,
                    role: "MEMBER"
                }
            });

            const { data, error } = await supabaseAdmin.auth.admin.generateLink({
                type: 'signup',
                email: email,
                password: password
            });

            if (error) {
                return res.status(201).json({
                    message: "Utente registrato, ma non è possibile generare il link di conferma",
                    user: newUser,
                    code: "LINK_GENERATION_FAILED"
                });
            }

            const emailResult = await sendConfirmationEmail(email, data.properties.action_link);

            return res.status(201).json({
                message: emailResult.emailSent
                    ? "Utente registrato ed email di conferma inviata."
                    : "Utente registrato, ma non è stato possibile inviare l'email di conferma.",
                user: newUser,
                emailSent: emailResult.emailSent,
                ...(emailResult.error && { code: "EMAIL_SEND_FAILED" })
            });

        }


    } catch (error) {
        console.error("Errore durante il signup:", error);
        return res.status(500).json({ error: "Errore durante la registrazione." })
    }

});

// Rotta di lettura dei dati dell'utente autenticato tramite requireAuth.
authRouter.get("/api/me", requireAuth, async (req: Request, res: Response) => {

    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(403).json({ error: "Utente non trovato." });
        }

        const userData = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                credits: true,
                tenant: { // Scendo nella relazione Tenant per recuperare anche lo status dell'abbonamento. Il frontend decide che dati mostrare. Member: identità canonica + crediti Admin: identità canonica + status abbonamento.
                    select: { status: true },
                },
            },
        });

        if (userData === null) {
            return res.status(404).json({ error: "Nessun utente trovato." });
        }

        return res.status(200).json({ user: userData });

    } catch (error) {
        console.error("Errore recupero utente", error);
        return res.status(500).json({ error: "Errore interno durante il recupero dati dell'utente." })
    }
});
