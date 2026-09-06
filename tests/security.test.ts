import {app} from '../src/app.js';
import supertest from 'supertest';
import { testToken } from './setup.js';
import { supabase } from '../src/supabase.js';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';


const payload={
    name:"Security User",
    price:100,
    duration:60
};

describe('Test con ruolo forgiato', ()=>{
    beforeAll(async ()=>{
        const {data, error}=await supabase.auth.updateUser({
            data:{role:'MEMBER'}
        });

        if(error || data.user?.user_metadata.role !== 'MEMBER'){
            throw new Error('Il ruolo non è stato aggiornato prima del lancio del test', {cause:error});
        }
    });

    afterAll(async ()=>{
        const {data, error}=await supabase.auth.updateUser({
            data:{role:'MEMBER'}
        });

        if(data.user?.user_metadata.role !== 'MEMBER'){
            throw new Error('Il ruolo non è stato aggiornato correttamente', {cause:error});
        }
    });

    it('Deve ritornare 403 quando si crea una stanza con ruolo forgiato', async ()=>{
        const {data, error}=await supabase.auth.updateUser({
            data:{role:'TENANTADMIN'}
        });

        if(data.user?.user_metadata.role !== 'TENANTADMIN'){
            throw new Error('Il ruolo non è stato aggiornato correttamente', {cause:error});
        }

        const res=await supertest(app).post('/api/rooms').set('Authorization', `Bearer ${testToken}`).send(payload);

        expect(res.status).toBe(403);
        expect(res.body.error).toBe("Accesso negato.");
    }); 
});

