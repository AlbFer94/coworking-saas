import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import {prisma} from '../prisma.js'

interface AuthenticatedUser{
  id:string;
  role:string;
  tenantId:string;
}

// Estendiamo il tipo Request di Express per includere l'utente autenticato.
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Intercetta richiesta HTTP al Server
export const requireAuth=async (req:Request,res:Response,next:NextFunction)=>{
    const header=req.headers['authorization'];


    //Verifica esistenza header e che inizi con Bearer
    if(!header || !header.startsWith('Bearer')){
        return res.status(401).json({error:'Token mancante o non valido'});
    }

    //Estrae il JWT
    const jwt=header.split(' ')[1];

     if(!jwt){
      return res.status(401).json({error:'Formato token non valido'});
     }

     try{
      const {data:{user}, error}= await supabase.auth.getUser(jwt);

      if(error || !user){
        return res.status(401).json({error:'Token non valido o sessione scaduta'})
      }

      const {data}= await supabase.auth.getClaims(jwt);

      if(data?.claims.amr?.some((entry) =>
        typeof entry !== 'string' && entry.method === 'otp' //NB: 'otp' è generico, copre anche magic link/inviti oggi equivale a recovery perché l'app non ha altri flussi OTP
      )){
        return res.status(401).json({error:'Operazione non consentita con una sessione di recupero password'})
      }

      //Inserisce lo User autenticato nella richiesta (req) di Express
      const dbUser=await prisma.user.findUnique({
        where:{id:user.id},
        select:{role:true, tenantId:true, deletedAt:true}
      });

      if(!dbUser){
        return res.status(401).json({error:'Utente non trovato'});
      }

      if(dbUser.deletedAt !== null){
        return res.status(403).json({error:'Utente eliminato'});
      }

      req.user={
        id:user.id,
        role:dbUser.role,
        tenantId:dbUser.tenantId
      };
      return next();
     }catch (err){
      console.error("Errore middleware auth:", err);
      return res.status(500).json({error:"'Errore del server durante l'autenticazione"})
     }
};

//Funzione RBAC (Role-Based Access Control) per il controllo dei ruoli, accetta un array di ruoli Es. ['TENANTADMIN', 'SUPERADMIN'] 
export const checkRole=(allowedRoles:string[]) =>{
  return (req:Request, res:Response, next:NextFunction)=>{

    //Verifica che lo user sia autenticato con requireAuth
    if(!req.user){
      return res.status(401).json({error:'Utente non autenticato'});
    }

    //Estrae il ruolo salvato sull'utente
    const userRole=req.user.role;

    if(!userRole || !allowedRoles.includes(userRole)){
      return res.status(403).json({error:"Accesso negato."});
    }

    return next();
  };
};





