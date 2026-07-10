import 'dotenv/config';
import express from 'express';
import type { Request, Response} from 'express';
import {prisma} from "./prisma.js"; //importa il singleton creato in prisma.ts
import {supabase} from "./supabase.js";
import { requireAuth, checkRole } from './middlewares/auth.js';
import { stripe, webhookSecret } from './stripe.js';
import { requireActiveSubscription } from './middlewares/billing.js';
import { isExclusionViolationError } from './lib/errors.js'; // Importa la funzione di type guard




const app=express();
const PORT=process.env.PORT||3000;

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
        console.error('Errore validazione firma: ${error.message}');
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
    } catch (error) {
        console.error("errore dettaglio del server:", error);
        return res.status(500).json({ error: "Errore durante la registrazione" });
    }
});

// lista di tutti i tenants (aziende) registrati

app.get("/api/tenants", async (_req, res) =>{ //uso req come _req per indicare che non viene utilizzato
    try{
        const tenantsList=await prisma.tenant.findMany({
            orderBy:[
                {name:"asc"},
                {slug:"asc"},
                {createdAt:"asc"}
            ]
        });
        return res.json(tenantsList);
    }catch(error){
        console.error(error)
        return res.status(500).json({ error: "Errore durante il recupero dei dati." });

    }
});

// Registrazione utente/amministratore con Auth Supabase e Prisma per il db
app.post("/api/auth/signup", async (req,res) =>{

    const {firstName, lastName, email, password,tenantId,role}=req.body;

    if(!firstName|| !lastName|| !email|| !password|| !tenantId){
        return res.status(400).json({error:"Campi obligatori mancanti."});
    }

    try{
        const {data:authData, error:authError}= await supabase.auth.signUp({
            email,
            password,
            options:{
                data:{firstName,lastName,tenantId,role:role||"MEMBER"}
            }
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
                role: role || "MEMBER"
            }
        });

        return res.status(201).json({message:"Utente registrato con successo", user:newUser});

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
    //Recupero del tenantId dai metadata di supabase iniettati nel middleware
    const tenantId= req.user?.user_metadata['tenantId'] as string | undefined;

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
            //recupero del tenantId dai metadata di supabase
            const tenantId= req.user?.user_metadata['tenantId'] as string | undefined;

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

    //Rotta di prenotazione stanza(Room) con controllo di sovrapposizione prenotazioni e decremento dei crediti dell'utente in una transazione atomica
    app.post("/api/bookings", requireAuth, requireActiveSubscription, async (req:Request, res:Response)=>{

        const {roomId, startTime, endTime, name, email, phone}=req.body;

        if(!roomId || !startTime || !endTime || !name || !email || !phone){
            return res.status(400).json({error:"Campi obbligatori mancanti."});
        }

        try{

            //Crea oggetto Date
            const start= new Date(startTime);
            const end= new Date(endTime);

            if(start>=end){
                return res.status(400).json({error:"L'orario di inizio deve essere precedente a quello di fine."});
            }

            //Controllo di sovrapposizione prenotazioni (anti-overlapping) solo per Fail Fast, il vero blocco è su constraint di esclusione in Postgres
            const overlappingBooking= await prisma.booking.findFirst({
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

            //Recupera l'id dello user che effettua la prenotazione
            const userId=req.user?.id;

            //Recupero del tenantId dai metadati di Supabase
            const tenantId= req.user?.user_metadata['tenantId'] as string | undefined;

            if(!tenantId){
                return res.status(401).json({error:"Identificativo azienda non trovato."});
            }

            if(!userId){
                return res.status(401).json({error:"Identificativo utente non trovato."});
            }

            //Controllo dei crediti dell'utente e creazione della prenotazione in una transazione atomica
            const newBooking=await prisma.$transaction(async (tx) => {
                const creditBalance= await tx.user.updateMany({
                    where:{
                        id:userId,
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
                        tenantId:tenantId
                    }
                });

                return booking;
            });

            // Invia un evento in tempo reale tramite Supabase per notificare la nuova prenotazione, isolato includendo il tenantId
            const realTimechannel=supabase.channel(`bookings:${tenantId}`);

            //Invia il messaggio in broadcast a tutti i forntend in ascolto
            realTimechannel.send({
                type:'broadcast',
                event:'new-booking',
                payload:{booking:newBooking} //invia i dettaglli della prenotazione appena creata.
            });


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





app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
