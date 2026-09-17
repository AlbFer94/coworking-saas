import './env';
import {prisma} from '../src/prisma';
import { beforeAll, beforeEach, afterEach, test, expect} from 'vitest';
import {supabase} from '../src/supabase.js';

export let memberA: {token: string; userId: string};
export let adminA: {token: string; userId: string};

beforeAll(async () =>{
    const {data, error}= await supabase.auth.signInWithPassword({
        email: process.env.TEST_USER_EMAIL!,
        password: process.env.TEST_USER_PASSWORD!,
    });

    if(error || !data.session){
        throw new Error('Errore durante il login del test user', {cause:error});
    }


    const {data: adminData, error: adminError}= await supabase.auth.signInWithPassword({
        email: process.env.TEST_ADMIN_EMAIL!,
        password: process.env.TEST_ADMIN_PASSWORD!,
    });

    if(adminError || !adminData.session){
        throw new Error('Errore durante il login dell\'admin', {cause:adminError});
    }

    memberA={token:data.session.access_token, userId:data.session.user.id};
    adminA={token:adminData.session.access_token, userId:adminData.session.user.id};

})

