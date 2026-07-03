import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import type { User } from '@supabase/supabase-js';

// Estendiamo il tipo Request di Express per includere l'utente di Supabase
declare global {
  namespace Express {
    interface Request {
      user?: User;
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

      //Inserisce lo User autenticato nella richiesta (req) di Express
      req.user=user;
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

    //Estrae il role salvato in user_metadata
    const userRole=req.user.user_metadata['role'] as string| undefined;

    if(!userRole || !allowedRoles.includes(userRole)){
      return res.status(403).json({error:"Accesso negato."});
    }

    return next();
  };
};





