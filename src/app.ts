import 'dotenv/config';
import express from 'express';
import type { Request, Response} from 'express';
import {prisma} from "./prisma.js"; //importa il singleton creato in prisma.ts
import {supabase,supabaseAdmin} from "./supabase.js";
import { requireAuth, checkRole } from './middlewares/auth.js';
import { stripe, webhookSecret } from './stripe.js';
import { requireActiveSubscription } from './middlewares/billing.js';
import { isExclusionViolationError } from './lib/errors.js'; // Importa la funzione di type guard
import { sendConfirmationEmail } from './lib/mailer.js';
import { Prisma } from '../generated/prisma/index.js';
import cors from 'cors';




export const app=express();
export const PORT=process.env.PORT||3000;

app.post("/api/webhooks", express.raw({type:'application/json'}), async (req,res)=>{

    //Intercetta la signature inviata da Stripe
    const signature=req.headers['stripe-signature'];

    if(!signature){
     return res.status(400).json({ error: "Firma Stripe mancante." });
    }


    let event;
    

    try{
        //Controlla che la richiesta provenga davvero da Stripe
        event=stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error: any) {
        console.error(`Errore validazione firma: ${error.message}`);
        return res.status(400).send(`Webhook Error: ${error.message}`);    
    }

    //Intercetta gli eventi asincroni di Stripe
    try{
        if(event.type==='invoice.paid'){
            const invoice=event.data.object as any;

            //estrazione di tenantId dai metadati restituiti da Stripe
            const tenantId=invoice.subscription_details?.metadata?.tenantId || invoice.metadata?.tenantId;

            if(!tenantId){
                console.error("webhook ricevuto ma nessun tenantId trovato nei metadati");
                return res.status(400).json({error:"tenantId mancante nei metadati di Stripe"})
            }

            console.log(` Ricevuto pagamento per il Tenant ID: ${tenantId}`);

            //Aggiornamento dello status per il Tenant (Azienda) che ha pagato
            const updatedTenant= await prisma.tenant.update({
                where:{id:tenantId},
                data:{status:"ACTIVE"}
            });

           console.log(`Tenant ${updatedTenant.name} attivato con successo`);
        }

        return res.status(200).json({received: true});

    }catch(error){
        console.error("Errore interno durante l'elaborazione del webhook", error);
        return res.status(500).json({error:"Errore interno del server."});
    }
});

//middleware CORS
const corsOrigin=process.env.CORS_ORIGIN;

if(!corsOrigin){
    throw new Error("CORS_ORIGIN non definita. Impostala nel file .env.");
}

app.use(cors({origin:corsOrigin}));

app.use(express.json());

// registrazione nuova azienda di co-working
app.post("/api/tenants", async (req, res) => {
    const { name, slug } = req.body;

    if (!name || !slug) {
        return res.status(400).json({ error: "Per favore, compila tutti i campi" });
    }

    try {
        const newTenant = await prisma.tenant.create({
            data: {
                name,
                slug,
            },
        });

        return res.status(201).json(newTenant);
    }catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // P2002: violazione di vincolo @unique. Su Tenant l'unico campo
            // @unique è slug, quindi il messaggio è accurato senza doverlo
            // ricavare dall'errore. Il campo violato sarebbe leggibile solo
            // da meta.driverAdapterError.cause.constraint.fields, struttura
            // interna dell'adapter pg, non documentata e non tipizzata.
            // Se in futuro Tenant avrà altri @unique, questo ramo va rivisto.
            if (error.code === "P2002") {
                return res.status(409).json({
                    error: "Questo codice azienda è già in uso.",
                    code: "SLUG_ALREADY_EXISTS"
                });
            }
        }

        console.error("Errore durante la creazione del tenant:", error);
        return res.status(500).json({ error: "Errore durante la registrazione" });
    }
});

// Registrazione utente/amministratore con Auth Supabase e Prisma per il db
app.post("/api/auth/signup", async (req,res) =>{

    const {firstName, lastName, email, password,slug}=req.body;

    if(!firstName|| !lastName|| !email|| !password||!slug){
        return res.status(400).json({error:"Campi obligatori mancanti."});
    }

    try{
        //Risoluzione slug -> tenant.
        const tenant=await prisma.tenant.findUnique({
            where:{
                slug:slug,
            },
        });

        if(!tenant){
            return res.status(400).json({error:"Codice invito non valido", code:"INVALID_TENANT_SLUG"})
        }

        const tenantId=tenant.id;

        // Fonte di verità per l'esistenza dell'email: Prisma, non Supabase.
        // Il record User viene creato in Prisma allo stesso momento in cui
        // viene creato su Supabase Auth (vedi ramo "else" sotto), quindi
        // una query qui basta a sapere se l'email è già nota al sistema,
        // senza dover interrogare Supabase (che non offre un getUserByEmail).
        const isRegistered= await prisma.user.findUnique({
            where:{
                email:email,
            },
        });

        if(isRegistered){
          // RAMO 2/3 — email già presente in Prisma.
          // admin.createUser() darebbe lo stesso errore generico "email
          // già esistente" sia per un utente confermato che per uno non
          // confermato: qui invece li distinguo esplicitamente
          // leggendo email_confirmed_at da Supabase Auth, perché il
          // comportamento corretto per il frontend è diverso nei due casi
          // (blocco secco vs. suggerire il recupero password).
          const userId=isRegistered.id;
          const {data,error}=await supabaseAdmin.auth.admin.getUserById(userId);

          if(error){
            return res.status(500).json({error:error.message});
          }

          if(!data.user.email_confirmed_at){
            // RAMO 3 — email registrata ma mai confermata. Con controllo su truthiness: copre sia null che undefined.
            // Non si aggiorna né si ricrea nulla (evita l'asimmetria
            // password/metadata scoperta in test precedenti): si blocca
            // e si segnala il code, così il frontend può guidare l'utente
            // al recupero password invece di un errore generico.
            return res.status(409).json({error:"Utente già registrato recuperare la password", code:"EMAIL_UNCONFIRMED"});
          }
          
          else{
            // RAMO 2 — email registrata e confermata: nessuna azione,
            // l'utente deve semplicemente fare login.
           return res.status(409).json({error:"Utente già esistente effettuare Login", code:"EMAIL_ALREADY_REGISTERED"});
          } 
        }
        
        else{
        // RAMO 1 — email non presente in Prisma: registrazione nuova.
        // admin.createUser() (Admin API, service role) al posto di
        // signUp() lato client: a differenza di signUp(), non applica
        // l'anti-enumeration (qui non serve, è una chiamata server-side
        // privilegiata) e soprattutto NON invia l'email di conferma da
        // sola — va gestita esplicitamente altrove nel flusso.
        const {data:authData, error:authError}= await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            user_metadata:{firstName,lastName,tenantId,role:"MEMBER"}
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

        const {data, error}= await supabaseAdmin.auth.admin.generateLink({
            type:'signup',
            email:email,
            password:password
        });

        if(error){
            return res.status(201).json({
                message:"Utente registrato, ma non è possibile generare il link di conferma",
                user:newUser,
                code:"LINK_GENERATION_FAILED"
            });
        }

        const emailResult=await sendConfirmationEmail(email, data.properties.action_link);

            return res.status(201).json({
                message: emailResult.emailSent
                ? "Utente registrato ed email di conferma inviata."
                : "Utente registrato, ma non è stato possibile inviare l'email di conferma.",
                user:newUser,
                emailSent:emailResult.emailSent,
                ...(emailResult.error && {code:"EMAIL_SEND_FAILED"})
            });

        }


    }catch(error){
        console.error("Errore durante il signup:", error);
        return res.status(500).json({error:"Errore durante la registrazione."})
    }

});



// Rotta di creazione stanze, protetta con middleware requireAuth e accessibile solo ai TENANTADMIN
app.post("/api/rooms", requireAuth, checkRole(['TENANTADMIN']), requireActiveSubscription, async (req:Request,res:Response)=>{
    const {name, price, duration}=req.body;

    //Validazione base dei dati in arrivo
    if(!name || price === undefined || !duration){
        return res.status(400).json({error:"Specificare nome della stanza, prezzo e durata "});
    }

    try{
    //Recupero del tenantId che requireAuth popola dal DB.
    const tenantId= req.user?.tenantId;

    if(!tenantId){
        return res.status(403).json({error:"Identificativo azienda (Tenant) non trovato."});
    }

    //Salva la nuova stanza associandola al tenantId
    const newRoom= await prisma.room.create({
        data:{
            name,
            price:Number(price), //Assicura che sia un Float/Number
            duration:Number(duration), //Assicura che sia un Int/Number
            tenantId
        }
    });
    
    return res.status(201).json({message:'Stanza creata  con successo', room:newRoom});
    }catch(error){
        console.error('Errore creazione stanza', error);
        return res.status(500).json({error:'Errore interno durante la creazione stanza.'});
    }
    });

    //Rotta di Chechout gestita con Stripe, protetta con middleware requireAuth e accessibile solo ai TENANTADMIN
    app.post("/api/billing/checkout", requireAuth, checkRole(['TENANTADMIN']), async (req:Request,res:Response)=>{

        try{
            //recupero del tenantId da requireAuth che popola il claim dal DB
            const tenantId= req.user?.tenantId;

            if(!tenantId){
                return res.status(403).json({error:"Identificativo azienda (Tenant) non consentito al pagamento"})
            }

            //Creazione sessione di checkout di Stripe
            const session= await stripe.checkout.sessions.create({
                  line_items:[
                    {
                        price:process.env.STRIPE_PRICE_ID!,
                        quantity:1,
                    },
                  ],
                  mode:'subscription',
                  success_url:"http://localhost:3000/api/billing/success",
                  cancel_url:"http://localhost:3000/api/billing/cancel",
                  metadata:{
                    tenantId:tenantId
                  },  
            });

            return res.status(200).json({message:"Sessione checkout creata con successo", checkoutUrl:session.url});
        }catch (error){
            console.error('Errore nel pagamento', error);
            return res.status(500).json({error:"Errore interno durante il tentativo di pagamento"});
        }
    } );

    //Rotta di prenotazione stanza(Room) con controllo di sovrapposizione prenotazioni e decremento dei crediti dell'utente in una transazione atomica.
    //Controllo Appartenenza: La Room richiesta deve appartenere al tenant del chiamante.
    app.post("/api/bookings", requireAuth, requireActiveSubscription, async (req:Request, res:Response)=>{

        const {roomId, startTime, endTime, name, email, phone}=req.body;

        if(!roomId || !startTime || !endTime || !name || !email || !phone){
            return res.status(400).json({error:"Campi obbligatori mancanti."});
        }

        try{

            //Crea oggetto Date
            const start= new Date(startTime);
            const end= new Date(endTime);

            //Recupera l'id dello user che effettua la prenotazione
            const userId=req.user?.id;

            //Recupero del tenantId da requireAuth che popola l'identità dal DB
            const tenantId= req.user?.tenantId;

            //La GUARD requireAuth garantisce che req.user sia definito, inserisco controllo se Typescript non sa che requireAuth è passato o se la rotta venisse montata senza middleware.
            if(!tenantId){
                return res.status(403).json({error:"Identificativo azienda non trovato."});
            }

            if(!userId){
                return res.status(403).json({error:"Identificativo utente non trovato."});
            }

            // Controllo di appartenenza. roomId arriva dal body ed è quindi
            // arbitrario: senza questa verifica un utente potrebbe prenotare una
            // stanza di un'altra azienda, marcando il record col proprio tenantId
            // e occupando la stanza altrui. Sul percorso Express + Prisma le policy
            // RLS non si applicano (connessione con ruolo BYPASSRLS e senza JWT),
            // quindi questo controllo è l'unico isolamento esistente.
            const room= await prisma.room.findUnique({
                where:{id: Number(roomId)},
                select:{tenantId:true},
            });

            // Stanza inesistente e stanza di un altro tenant danno la stessa
            // risposta: distinguerle rivelerebbe quali roomId esistono nel sistema.
            // Il confronto copre entrambi i casi perché su stanza assente
            // room?.tenantId è undefined, mentre tenantId è garantito dalla guardia sopra.
            if(tenantId !== room?.tenantId){
                return res.status(404).json({error:"La stanza selezionata non esiste"});
            }

            if(start>=end){
                return res.status(400).json({error:"L'orario di inizio deve essere precedente a quello di fine."});
            }


            //Controllo di sovrapposizione prenotazioni (anti-overlapping) solo per Fail Fast, il vero blocco è su constraint di esclusione in Postgres
            const overlappingBooking= await prisma.booking.findFirst({
                //Il controllo viene fatto solo su roomId in quanto l'appartenenza della room al tenant viene eseguita prima nella rotta.
                where:{
                    roomId:Number(roomId), //controlla la stessa stanza
                    AND:[
                        {
                            startTime:{
                                lt:end //l'inizio della nuova richiesta prenotazione è prima della fine di una prenotazione esistente
                            }
                        },
                        {
                            endTime:{
                                gt:start //la fine della nuova richiesta prenotazione è dopo l'inizio di una prenotazione esistente
                            }
                        }
                    ]
                }
            });

            if(overlappingBooking){
                return res.status(400).json({error:"Impossibile prenotare. La stanza è già occupata in questo intervallo di tempo."});
            }


            //Controllo dei crediti dell'utente e creazione della prenotazione in una transazione atomica
            const newBooking=await prisma.$transaction(async (tx) => {

                const creditBalance= await tx.user.updateMany({
                    where:{
                        id:userId,
                        deletedAt: null,
                        credits:{gt:0} //controlla che l'utente abbia crediti disponibili
                    },
                    data:{
                        credits:{decrement:1}
                    }
                });

                if(creditBalance.count===0){
                    throw new Error("CREDITO_INSUFFICENTE");
                }

                //Crea la prenotazione direttamente nel contesto della transazione
                const booking= await tx.booking.create({
                    data:{
                        roomId:Number(roomId),
                        startTime:start,
                        endTime:end,
                        name,
                        email,
                        phone,
                        tenantId:tenantId,
                        userId:userId
                    }
                });

                return booking;
            });

            // Invia un evento in tempo reale tramite Supabase per notificare la nuova prenotazione, isolato includendo il tenantId
            const realTimechannel=supabase.channel(`bookings:${tenantId}`);

            try{

            //Invia il messaggio in broadcast a tutti i frontend in ascolto
            await realTimechannel.httpSend('new-booking', { booking: newBooking }) //invia i dettagli della prenotazione appena creata.


            }catch(error){
            console.error("Notifica realTime non inviata correttamente:", error);            
            }

            try{
            await supabase.removeChannel(realTimechannel);
            }catch(error){
                console.error("Errore durante la pulizia del channel realTime:", error);
            }




            return res.status(201).json({message:"Prenotazione creata con successo", booking:newBooking});
        } catch (error) {
            console.error('Errore creazione prenotazione', error);
            if(isExclusionViolationError (error) && error.cause.code=== '23P01'){
                return res.status(409).json({error:"Impossibile prenotare. La stanza è già occupata in questo intervallo di tempo."});
            } else if (error instanceof Error && error.message === 'CREDITO_INSUFFICENTE') {
                return res.status(400).json({error:"Credito insufficente per effettuare la prenotazione."});
            } else {
                return res.status(500).json({error:'Errore interno durante la creazione della prenotazione.'});
            }
        }
    });





