import { supabase } from "../lib/supabase";
import React, { createContext, useState, useContext, useEffect } from "react";

interface AuthProviderProps {
    children: React.ReactNode
}

// Forma "pulita" dello stato di autenticazione condiviso in tutta l'app.
// "user" è già appiattito (id, name, email, role) invece di esporre
// l'oggetto grezzo di Supabase: il resto dell'app lavora con una forma
// stabile, isolata da come Supabase struttura i dati internamente.
type AuthContextType = {
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
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hook custom per leggere il Context. Centralizza la guardia a runtime
// così nessun componente deve ricordarsi di controllare "undefined" da solo.
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        // Se questo scatta, vuol dire che un componente è stato usato
        // fuori dall'albero avvolto da <AuthProvider>.
        throw new Error("un componente ha chiamato useAuth fuori da AuthProvider");
    }
    return context;
};

// tipo per gestione chiamata a /api/me. 
// Oltre all'esito ok con payload user e all'error, viene dichiarato il caso rejected evitando che 
// il listener imposti isLogged = true, deve chiamare signOut() e uscire.
type ProfileResult =
    | { message: "rejected" }
    | { message: "error" }
    | { message: "ok"; user: NonNullable<AuthContextType["user"]> };

async function fetchProfile(accessToken: string): Promise<ProfileResult> {

    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 401 || response.status === 403) {
            return { message: "rejected" };
        }

        if (!response.ok) {
            console.error("Errore durante il recupero del profilo /api/me:", response.status);
            return { message: "error" };
        }

        const data = await response.json();
        return {
            message: "ok", user: {
                id: data.user.id,
                name: `${data.user.firstName} ${data.user.lastName}`.trim(),
                email: data.user.email,
                role: data.user.role
            }
        };

    } catch (error) {
        console.error("Errore durante il recupero del profilo /api/me:", error);
        return { message: "error" };
    }
}

const AuthProvider = (props: AuthProviderProps) => {
    const [user, setUser] = useState<AuthContextType['user']>(null)
    const [isLogged, setIsLogged] = useState<boolean>(false)
    const [isSessionChecked, setIsSessionChecked] = useState<boolean>(false)

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {

            setTimeout(async () => {
                if (session) {
                    const { data } = await supabase.auth.getClaims();
                    const hasPasswordRecovery =
                        data?.claims.amr?.some((entry) =>
                            typeof entry === "string"
                                ? entry === "otp" // NB: 'otp' è generico, copre anche magic link/inviti 
                                // oggi equivale a recovery perché l'app non ha altri flussi OTP
                                : entry.method === "otp"
                        ) ?? false;


                    if (hasPasswordRecovery) {
                        setIsLogged(false);
                        setUser(null);
                        setIsSessionChecked(true);
                        return;
                    }

                    // Profilo canonico dalla tabella User via backend, non da user_metadata (scrivibile dal client).
                    const profile = await fetchProfile(session.access_token);

                    if (profile.message === "rejected") {
                        // Il server rifiuta questa sessione (401/403, es. utente soft-deleted): tenerla aperta
                        // lascerebbe lo stato incoerente. signOut fa scattare SIGNED_OUT, che rientra in questo
                        // listener nel ramo else e azzera user/isLogged/isSessionChecked: qui nessun set.
                        const { error } = await supabase.auth.signOut();
                        if (error) {
                            console.error("Errore durante il logout forzato:", error);
                        }
                        return;
                    }

                    if (profile.message === "ok") {
                        setUser(profile.user); // TS sa che .user esiste solo in questo ramo (discriminated union)
                    } else {
                        // Guasto temporaneo (500/rete): la sessione resta valida, il profilo no.
                        setUser(null);
                    }
                    setIsLogged(!!session)
                    setIsSessionChecked(true)
                } else {
                    setUser(null);
                    setIsLogged(false);
                    setIsSessionChecked(true);
                }
            }, 0)

        });

        return () => {
            subscription.unsubscribe()
        }
    }, []);

    const logout = async () => {
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error("Errore durante il logout", error);
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
