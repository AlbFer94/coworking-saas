import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { supabaseAdmin } from '../src/supabase.js';
import { test, expect, beforeEach, describe, afterEach, vi } from 'vitest';
import { memberA } from './setup.js';
import { randomUUID } from 'node:crypto';

vi.mock(import('../src/lib/mailer.js'), () => {
    return {
        sendConfirmationEmail: vi.fn().mockResolvedValue({ emailSent: true })
    }
});

describe('POST /api/tenants', () => {

    let payload: {
        firstName: string,
        lastName: string,
        email: string,
        name: string,
        slug: string,
        password: string
    };

    let fakeSub: string;

    let createUserSpy: ReturnType<typeof vi.spyOn>;
    let generateLinkSpy: ReturnType<typeof vi.spyOn>;
    let deleteUserSpy: ReturnType<typeof vi.spyOn>;

    function sabotageUserCreate() {
        // 1. Salva la $transaction VERA in una const, prima di spiarla.
        // Dopo lo spyOn, prisma.$transaction sarebbe la spia stessa:
        // chiamarla dentro la spia creerebbe un ciclo infinito.
        const realTransaction = prisma.$transaction.bind(prisma);

        // 2. Spia su $transaction: quando la rotta la chiama...
        vi.spyOn(prisma, '$transaction').mockImplementation((routeCallback: any) =>
            //apri una transazione VERA (così il rollback è reale)
            realTransaction(async (tx: any) => {
                //prima di eseguire il codice della rotta, fai fallire tx.user.create con un errore generico (NON P2002).
                vi.spyOn(tx.user, 'create').mockRejectedValue(new Error('FORCED_TX_FAILURE'));
                // Esegui il codice della rotta con questo tx "sabotato".
                return routeCallback(tx);
            }));
    }


    beforeEach(() => {
        const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`; // aggiunge un pezzo random di UUID nel Date.now per evitare slug identici in richieste partite in simultanea. il risultato è Es.1759154990123-3f9a1c2e.

        payload = {
            firstName: 'test',
            lastName: 'controllo',
            email: `controllo-${uniqueSuffix}@example.com`,
            slug: `controllo-${uniqueSuffix}`,
            name: "Tenant viTest",
            password: "passwordTest"
        };

        fakeSub = randomUUID();

        createUserSpy = vi.spyOn(supabaseAdmin.auth.admin, 'createUser')
            .mockResolvedValue({ data: { user: { id: fakeSub } as any }, error: null });

        generateLinkSpy = vi.spyOn(supabaseAdmin.auth.admin, 'generateLink')
            .mockResolvedValue({ data: { properties: { action_link: "http://finto", email_otp: "", hashed_token: "", redirect_to: "", verification_type: "signup" }, user: { id: fakeSub } as any }, error: null });

        deleteUserSpy = vi.spyOn(supabaseAdmin.auth.admin, 'deleteUser')
            .mockResolvedValue({ data: { user: { id: fakeSub } as any }, error: null });
    });

    afterEach(async () => {
        vi.clearAllMocks();
        vi.restoreAllMocks();

        await prisma.tenant.deleteMany({
            where: { slug: payload.slug }
        });
    });

    test('Happy Path, deve ritornare res.status 201 con id=fakeSub, role=TENANTADMIN e status=INACTIVE', async () => {
        const res = await request(app).post("/api/tenants").send(payload);

        expect(res.status).toBe(201);
        expect(createUserSpy).toHaveBeenCalledTimes(1);
        expect(deleteUserSpy).not.toHaveBeenCalled();
        expect(generateLinkSpy).toHaveBeenCalledTimes(1);

        const user = await prisma.user.findUnique({
            where: { email: payload.email },
            select: {
                id: true,
                role: true,
            },
        });

        expect(user?.id).toBe(fakeSub);
        expect(user?.role).toBe("TENANTADMIN");

        const tenant = await prisma.tenant.findUnique({
            where: { slug: payload.slug },
            select: {
                status: true
            },
        });

        expect(tenant?.status).toBe("INACTIVE");
    });

    test('Test 2a: deve fallire la creazione dello user e ripulire il db da eventuali orfani con deleteUser', async () => {

        sabotageUserCreate();

        const res = await request(app).post("/api/tenants").send(payload);

        expect(res.status).toBe(500);
        expect(res.body.code).toBe('REGISTRATION_FAILED_RETRY');
        expect(createUserSpy).toHaveBeenCalledTimes(1);
        expect(deleteUserSpy).toHaveBeenCalledWith(fakeSub);

        const tenant = await prisma.tenant.findUnique({
            where: {
                slug: payload.slug
            },
        });

        expect(tenant).toBeNull();

        const user = await prisma.user.findUnique({
            where: {
                email: payload.email
            },
        });

        expect(user).toBeNull();
    });

    test('Test 2b: Anche deleteUser deve fallire, dimostrando che la pulizia bestEffort non rompe la risposta.', async () => {

        sabotageUserCreate();

        deleteUserSpy.mockRejectedValue(new Error('FORCED_DELETE_FAILURE'));

        const res = await request(app).post("/api/tenants").send(payload);

        expect(res.status).toBe(500);
        expect(res.body.code).toBe('REGISTRATION_FAILED_RETRY');
        expect(deleteUserSpy).toHaveBeenCalledWith(fakeSub);

        const tenant = await prisma.tenant.findUnique({
            where: {
                slug: payload.slug
            },
        });

        expect(tenant).toBeNull();
    });

    test('Test 3a: testa la risposta con slug già esistente. Deve ritornare status 409 e code:SLUG_ALREADY_EXISTS, lo user non deve essere creato', async () => {

        await prisma.tenant.create({
            data: {
                name: 'Test-3a',
                slug: payload.slug,
            },
        });

        const res = await request(app).post("/api/tenants").send(payload);

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SLUG_ALREADY_EXISTS');
        expect(createUserSpy).not.toHaveBeenCalled();
    });

    test('Test 3b: testa la risposta con email esistente. Deve ritornare status 409 code:FOUNDER_REGISTRATION_REFUSED.', async () =>{

        const user= await prisma.user.findUnique({
            where:{
                id:memberA.userId
            },
            select:{
                email:true
            },
        });

        if(!user){
            throw new Error("fixture memberA non trovato");
        }

        const res = await request(app).post("/api/tenants").send({
            ...payload,
            email: user.email,
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('FOUNDER_REGISTRATION_REFUSED');
        expect(createUserSpy).not.toHaveBeenCalled();
    });
});

