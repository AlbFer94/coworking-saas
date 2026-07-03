import "dotenv/config";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";

// cache globale per evitare instanze multiple in fase di sviluppo (Hot Reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let prismaInstance:PrismaClient;

if(globalForPrisma.prisma){
    prismaInstance=globalForPrisma.prisma;
}else{
    //Inizializza il pool nativo di Postgress con l'URL Supabase
    const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});

    //adapter prisma richiesto in v7
    const adapter=new PrismaPg(pool);

    //client
    prismaInstance=new PrismaClient({adapter});

    if (process.env.NODE_ENV !== "production"){
    globalForPrisma.prisma=prismaInstance;
}

}

export const prisma=prismaInstance;



