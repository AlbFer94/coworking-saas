import request from 'supertest';
import {app} from '../src/app.js';
import {it, expect, describe, beforeAll, afterAll} from 'vitest';
import {prisma} from '../src/prisma.js';
import {memberA, adminA} from './setup';


let roomA2Id: number;
let tenantAId:string;
let tenantBId: string;
let ghostBId: string;
let roomB1Id: number;

beforeAll(async ()=>{
    const admin = await prisma.user.findUnique({
        where: {id: adminA.userId},
        select: {tenantId: true}
    });

    if (!admin?.tenantId) throw new Error('Tenant not found for admin');

    const roomA2= await prisma.room.create({
        data:{
            name: 'Room A2',
            price: 10,
            duration: 60,
            tenant: {
                connect: {id: admin.tenantId}
            }

        }
    });
    roomA2Id=roomA2.id;
    tenantAId=admin.tenantId;

    const tenantB= await prisma.tenant.create({
        data:{
            name:'Tenant B',
            slug:'tenant-b',
        }
    })
    tenantBId=tenantB.id;

    const ghostB= await prisma.user.create({
        data:{
            firstName:'Ghost',
            lastName:'B',
            email:'ghost@tenantb.com',
            tenant:{
                connect:{id:tenantBId}
            }
        }
    });
    ghostBId=ghostB.id;

    const roomB1= await prisma.room.create({
        data:{
            name:'Room B1',
            price: 10,
            duration: 60,
            tenant:{
                connect:{id:tenantBId}
            }
        }
    });
    roomB1Id=roomB1.id;

    const future=new Date();
    
    const past=new Date(Date.now() - 2*60*60*1000); // due ore fa

    const sentinelData={
        name:'LEAK-name',
        email:'leak@pii.test',
        phone:'1234567890'
    };

     await prisma.booking.create({
        data:{
            userId:memberA.userId,
            name: sentinelData.name,
            email: sentinelData.email,
            phone: sentinelData.phone,
            startTime: future,
            endTime: new Date(future.getTime() + 60 * 60 * 1000*2), //aggiunge due ore
            roomId: 1,
            tenantId: tenantAId,
            status: 'APPROVED'
        }
    });

     await prisma.booking.create({
        data:{
            userId:adminA.userId,
            roomId:roomA2Id,
            tenantId:tenantAId,
            name: sentinelData.name,
            email: sentinelData.email,
            phone: sentinelData.phone,
            startTime: future,
            endTime: new Date(future.getTime() + 60 * 60 * 1000),
            status:'APPROVED'
        }
    });

     await prisma.booking.create({
        data:{
            userId:memberA.userId,
            roomId:1,
            tenantId:tenantAId,
            status:'REJECTED',
            name:sentinelData.name,
            email:sentinelData.email,
            phone:sentinelData.phone,
            startTime:past,
            endTime: new Date(past.getTime() + 60*60*1000) 
        }
    });

     await prisma.booking.create({
        data:{
            userId:ghostBId,
            roomId:roomB1Id,
            tenantId:tenantBId,
            name:'Booking B1',
            email:'booking-b1@test.com',
            phone:'1112223333',
            startTime:future,
            endTime: new Date(future.getTime()+60*60*1000)
        }
    });
});

 afterAll(async ()=>{
    await prisma.booking.deleteMany({
        where:{tenantId:{in:[tenantAId, tenantBId]}}
    });
    
    await prisma.room.delete({
        where:{id:roomA2Id}
    });

    await prisma.tenant.delete({
        where:{id:tenantBId}
    });
});
 
describe('smoke test /api/me', () =>{

    it('deve ritornare 200 per la rotta /api/me con ruolo user MEMBER', async () =>{
        const res= await request(app).get('/api/me').set('Authorization', `Bearer ${memberA.token}`);

        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('MEMBER');
    } );

        it('deve ritornare 200 per la rotta /api/me con ruolo user TENANTADMIN', async () =>{
            const res= await request(app).get('/api/me').set('Authorization', `Bearer ${adminA.token}`);

            expect(res.status).toBe(200);
            expect(res.body.user.role).toBe('TENANTADMIN');
        });

});

describe('GET /api/bookings', ()=>{

    it('MEMBER_A vede solo le sue prenotazioni storico incluso', async ()=>{
        const res= await request(app).get('/api/bookings').set('Authorization',  `Bearer ${memberA.token}`);

        //Assert di sanità (prima isolo le variabili per capire se il test è corretto).
        expect(res.status).toBe(200);

        //Assert positivo: il MEMEBER_A vede solo  le sue 2 prenotazioni una APPROVED e una REJECTED, entrambe nel suo tenant (tenantAId)
        expect(res.body.bookings).toHaveLength(2);
        expect(res.body.bookings.map((b:any)=>b.status)).toEqual(expect.arrayContaining(['APPROVED', 'REJECTED']));

        //Assert negativo: il MEMBER_A non vede la prenotazione fatta dal suo admin (adminA), e non vede altre prenotazioni in altri tenant (roomB1).
        expect(res.body.bookings.map((b:any)=>b.room.name)).not.toContain('Room A2');
        expect(res.body.bookings.map((b:any)=>b.room.name)).not.toContain('Room B1');
    });

    it('ADMIN_A vede tutte le prenotazioni del tenantAId ma nulla del tenantBId', async()=>{
        const res= await request(app).get('/api/bookings').set('Authorization', `Bearer ${adminA.token}`);

        //Assert di sanità del test
        expect(res.status).toBe(200);

        //Assert positivo l'ADMIN_A vede 3 prenotazioni (la sua + le 2 del MEMBER_A sullo stesso tenantAId).
        expect(res.body.bookings).toHaveLength(3);
        expect(res.body.bookings.map((b:any)=>b.status)).toEqual(expect.arrayContaining(['APPROVED', 'REJECTED']));

        //admin-include/member esclude, ADMIN_A vede Room A2 verificando che il branch di ruolo sulla rotta API funziona.
        expect(res.body.bookings.map((b:any)=>b.room.name)).toContain('Room A2');

        //Assert negativo, anche l'ADMIN_A è escluso dalla lettura crosstenant quindi non vede altri tenant (roomb1).
        expect(res.body.bookings.map((b:any)=>b.room.name)).not.toContain('Room B1');
    });
});

describe('GET/api/rooms', ()=>{

    it('Espone le stanze del tenant con fasce prive di PII', async ()=>{
        const res= await request(app).get('/api/rooms').set('Authorization',  `Bearer ${memberA.token}`);

        //Assert di sanità del test
        expect(res.status).toBe(200);

        //isolamento
        expect(res.body.rooms).toHaveLength(2);
        expect(res.body.rooms.map((r:any)=>r.name)).not.toContain('Room B1');

        //Appiattisco i time-slots per lavorarci sopra
        const slots= res.body.rooms.flatMap((r:any)=>r.bookings);
        expect(slots).toHaveLength(2);

        //PII strutturale
        slots.forEach((s:any)=>expect(Object.keys(s).sort()).toEqual(['endTime', 'startTime']));

        //PII canary: nessun campo PII deve essere presente nei time-slots
        expect(JSON.stringify(res.body)).not.toContain('LEAK-name');
        expect(JSON.stringify(res.body)).not.toContain('leak@pii.test');
    });
});
