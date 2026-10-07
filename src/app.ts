import 'dotenv/config';
import express from 'express';
import type { Request, Response} from 'express';
import {prisma} from "./prisma.js"; //importa il singleton creato in prisma.ts
import { requireAuth, checkRole } from './middlewares/auth.js';
import { stripe, webhookSecret } from './stripe.js';
import cors from 'cors';
import { roomsRouter } from './routes/rooms.routes.js';
import { bookingsRouter } from './routes/bookings.routes.js';
import { authRouter } from './routes/auth.routes.js';





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
app.use(authRouter); // Rotte di identità: registrazione fondatore, signup membri, /api/me.
app.use(roomsRouter); // Monta il router delle stanze
app.use(bookingsRouter); //Monta il router per le bookings.



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

