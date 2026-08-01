import { supabase } from "../lib/supabase";
import React,{ createContext, useState, useContext, useEffect } from "react";
import type { User } from "@supabase/supabase-js";

interface AuthProviderProps{
children: React.ReactNode
}

// Forma "pulita" dello stato di autenticazione condiviso in tutta l'app.
// "user" è già appiattito (id, name, email, role) invece di esporre
// l'oggetto grezzo di Supabase: il resto dell'app lavora con una forma
// stabile, isolata da come Supabase struttura i dati internamente.
type AuthContextType={
    user: {
        id: string;
        name: string;
        email: string;
        role?: string;
    } | null;
    isLogged: boolean; // true/false: l'utente è autenticato o no
    isSessionChecked: boolean; // distingue "sto ancora controllando la sessione salvata"
                                // da "ho controllato, non sei loggato" — evita falsi
                                // lampi di redirect al login per utenti già autenticati
    logout: () => Promise<void>;
}

// Default esplicito a "undefined" (non un oggetto fittizio completo):
// se qualcuno usa useAuth() fuori da AuthProvider, da un errore
// chiaro subito, non un bug silenzioso (es. isLogged: false di nascosto).
const AuthContext=createContext<AuthContextType | undefined>(undefined);

// Hook custom per leggere il Context. Centralizza la guardia a runtime
// così nessun componente deve ricordarsi di controllare "undefined" da solo.
export const useAuth=()=>{
    const context=useContext(AuthContext);
    if(context===undefined){
        // Se questo scatta, vuol dire che un componente è stato usato
        // fuori dall'albero avvolto da <AuthProvider>.
        throw new Error("un componente ha chiamato useAuth fuori da AuthProvider");
    }
    return context;
};

// Trasforma l'oggetto "User" grezzo di Supabase (input) nella forma
// piatta AuthContextType['user'] (output) che usa il resto dell'app.
// Nota: NON è l'intero AuthContextType — solo il pezzo "user" — perché
// isLogged/isSessionChecked sono gestiti a parte dal Provider.
function mapSupabaseUser(user: User | null): AuthContextType['user'] {
    if(!user) return null;

    // user_metadata è tipizzato da Supabase come { [key: string]: any },
    // quindi accedo alle proprietà senza cast "as any": il tipo
    // generico lo permette già, senza disattivare i controlli di TS.
    const metadata=(user.user_metadata) || {};

    // Non esiste un campo "name" diretto su Supabase: va costruito
    // unendo firstName + lastName salvati in user_metadata al signup.
    // Fallback singoli per evitare "undefined undefined" se mancano.
    const first=metadata.firstName || '';
    const last=metadata.lastName || '';

    return {
        id: user.id,
        // .trim() rimuove lo spazio residuo nel caso limite in cui
        // sia first che last siano stringhe vuote.
        name:`${first} ${last}`.trim(),
        email: user.email || '',
        role: metadata.role || ''
    };
}

const AuthProvider=(props:AuthProviderProps)=>{
    const [user, setUser]=useState<AuthContextType['user']>(null)
    const [isLogged, setIsLogged]=useState<boolean>(false)
    const [isSessionChecked, setIsSessionChecked]=useState<boolean>(false)

    useEffect(()=>{
        const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
        setUser(mapSupabaseUser(session?.user || null))
        setIsLogged(!!session)
        setIsSessionChecked(true)
        })

        return ()=>{
            subscription.unsubscribe()
        }
    },[]);

        const logout=async ()=>{
            const {error}= await supabase.auth.signOut();

            if (error){
                console.error("Errore durante il logout",error);
            }
        };

        const value: AuthContextType = {
            user,
            isLogged,
            isSessionChecked,
            logout
        };

        return (
            <AuthContext.Provider value={value}>
                {props.children}
            </AuthContext.Provider>
        );
}

export default AuthProvider;
