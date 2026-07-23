import './env';
import {prisma} from '../src/prisma';
import { beforeAll, beforeEach, afterEach, test, expect} from 'vitest';
import {supabase} from '../src/supabase.js';
export let testToken:string;
export let testUserId:string;

beforeAll(async () =>{
    const {data, error}= await supabase.auth.signInWithPassword({
        email: process.env.TEST_USER_EMAIL!,
        password: process.env.TEST_USER_PASSWORD!,
    });


    if(error || !data.session){
        throw new Error('Errore durante il login del test user', {cause:error});
    }

    testToken=data.session.access_token;
    testUserId=data.session.user.id;

})

