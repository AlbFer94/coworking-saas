import request from 'supertest';
import {app} from '../src/app.js';
import {test, expect, beforeEach, describe, afterEach} from 'vitest';
import {testToken, testUserId} from './setup';
import {prisma} from '../src/prisma.js';
import { isExclusionViolationError } from '../src/lib/errors.js';


const startTime1=new Date();
const endTime1=new Date(startTime1.getTime() + 60 * 60 * 1000); //aggiunge 1 ora

const startTime2=new Date(endTime1.getTime()+30*60*1000);//30 minuti dopo la fine della prima prenotazione
const endTime2=new Date(startTime2.getTime()+60*60*1000); //aggiunge un ora

const payload1={
    startTime: startTime1.toISOString(),
    endTime: endTime1.toISOString(),
    roomId: 1,
    name: "Test Booking 1",
    email: "test@example.com",
    phone: "1234567890"
}

const payload2={
    startTime:startTime2.toISOString(),
    endTime:endTime2.toISOString(),
    roomId: 1,
    name: "Test Booking 1",
    email: "test@example.com",
    phone: "1234567890"
}

describe('Test prenotazioni concorrenti', () =>{
    beforeEach(async () => {
         await prisma.user.update({
            where: {id:testUserId},
            data: {credits:1}
        });
    });

    afterEach(async () =>{
        const cleanup= await prisma.booking.deleteMany({
            where:{userId:testUserId}
        });
    });

    test('deve ritornare 201 e 400 quando si inviano due richieste concorrenti', async () => {
    const res1 = request(app).post('/api/bookings').set('Authorization', `Bearer ${testToken}`).send(payload1);
    const res2 = request(app).post('/api/bookings').set('Authorization', `Bearer ${testToken}`).send(payload2);

    const results = await Promise.allSettled([res1, res2]);

    console.log('res1 body:', results[0].status === 'fulfilled' ? results[0].value.body : results[0].reason);
    console.log('res2 body:', results[1].status === 'fulfilled' ? results[1].value.body : results[1].reason);

    const statuses = results.map((result) => {
        if (result.status === 'fulfilled') {
            return result.value.status;
        }
        throw result.reason;
    });

    expect(statuses.sort((a, b) => a - b)).toEqual([201, 400]);

    const creditCheck= await prisma.user.findUnique({
        where: {id:testUserId},
        select: {credits:true}
    });

    expect(creditCheck?.credits).toBe(0);


    });

    test('Happy path: prenotazione valida, credito scalato correttamente', async () =>{
    const response = await request(app).post('/api/bookings').set('Authorization', `Bearer ${testToken}`).send(payload1);

    expect(response.body.booking).toEqual(expect.objectContaining({
    startTime: startTime1.toISOString(),
    endTime: endTime1.toISOString(),
    roomId: 1,
    name: "Test Booking 1",
    email: "test@example.com",
    phone: "1234567890",
    id: expect.any(Number)
    }));

    expect(response.status).toBe(201);
    
    const creditCheck= await prisma.user.findUnique({
        where:{id:testUserId},
        select:{credits:true}
    });

    expect(creditCheck?.credits).toBe(0);

    });

    test('Credito insufficente: un Member con credit 0 tenta di prenotare', async () =>{
        await prisma.user.update({
            where: {id:testUserId},
            data: {credits:0}
        });

        const response = await request(app).post('/api/bookings').set('Authorization', `Bearer ${testToken}`).send(payload1);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Credito insufficente per effettuare la prenotazione.");
    });

    test('Double-booking: Testa il meccanismo di fail-fast.', async () =>{

        await prisma.user.update({
            where:{id:testUserId},
            data:{credits:2}
        });
        
        const res1 = await request(app).post('/api/bookings').set('Authorization', `Bearer ${testToken}`).send(payload1);

        expect(res1.status).toBe(201);

        const res2=await request(app).post('/api/bookings').set('Authorization', `Bearer ${testToken}`).send(payload1);

        expect(res2.status).toBe(400);
        expect(res2.body.error).toBe("Impossibile prenotare. La stanza è già occupata in questo intervallo di tempo.")
    });

    test('Exclusion constraint: due richieste di prenotazioni concorrenziali sullo stesso slot temporale', async () =>{

        const directBookingData1= prisma.booking.create({
            data:{
                roomId:1,
                startTime: startTime1.toISOString(),
                endTime: endTime1.toISOString(),
                name: "Test Booking 1",
                email: "test@example.com",
                phone: "1234567890",
                tenantId:'fc9ee7a0-f78d-43b8-bfd7-2e1deb6b6c7c',
                userId:testUserId
            }
        });

        const directBookingData2=prisma.booking.create({
            data:{
                roomId:1,
                startTime: startTime1.toISOString(),
                endTime: endTime1.toISOString(),
                name: "Test Booking 1",
                email: "test@example.com",
                phone: "1234567890",
                tenantId:'fc9ee7a0-f78d-43b8-bfd7-2e1deb6b6c7c',
                userId:testUserId
            }
        });



        const results=await Promise.allSettled([directBookingData1, directBookingData2]);

            const statuses = results.map((result) => {
        if (result.status === 'fulfilled') {
            return result.status;
        }else{
            return 'rejected'
        }
        });

        expect(statuses.sort((a, b) => a.localeCompare(b))).toEqual(['fulfilled', 'rejected']);

        const result = results.find(result => 
        result.status === 'rejected' 
        );

        if(result?.status === 'rejected'){
            const error = result.reason;
            expect(isExclusionViolationError(error)).toBe(true);
            if(isExclusionViolationError(error)){
                expect(error.cause.code).toBe('23P01')
            }
        }
    });

});

