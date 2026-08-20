import {useEffect, useState} from "react";
import {supabase} from "../lib/supabase";
import CustomInput from "../components/CustomInput";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router";

function Registrazione(){

    const[contact, setContact]=useState({
        firstName:"",
        lastName:"",
        email:"",
        password:"",
        slug:"",
    });

    const [errorMessage, setErrorMessage]=useState<string | null>(null);
    const [successMessage, setSuccessMessage]=useState<string |null>(null);
    const navigate = useNavigate();
    const {isLogged}=useAuth();

    useEffect(()=>{
        if(isLogged){
            navigate("/");
        }
    }, [isLogged, navigate]);



    function handleChange(event:React.ChangeEvent<HTMLInputElement>){
        const{name,value}=event.target;
        setContact((prevValue)=>{
            return{
                ...prevValue,
                [name]:value,
            };
        });
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const { data, error } = await supabase.auth.signUp({
            email: contact.email,
            password: contact.password,
            options: {
                data: {
                    name: `${contact.firstName} ${contact.lastName}`.trim(),
                    slug: contact.slug,
                    role: "MEMBER" // di default MEMEBER 
                },
            },
        });

        if (error?.code === 'email_exists') {
            console.error("L'email fornita è già esistente");
            setErrorMessage("L'email fornita è già stata registrata. Prova a effettuare il login o utilizza un'altra email.");
            setSuccessMessage(null);
            
        } else if (error) {
            console.error("Errore durante la registrazione:", error.message);
            setErrorMessage(error.message);
            setSuccessMessage(null);

        } else if (data.user?.identities?.length === 0){
            // Supabase non restituisce un errore per email già registrate e confermate
            // (previene la user enumeration): restituisce invece un utente "fake" con
            // identities vuoto. Questo è l'unico modo per distinguerlo da una vera signup.
            setErrorMessage("Email già registrata. Effettua il login o utilizza un'altra email.");
            setSuccessMessage(null);
        }else {
            setErrorMessage(null);
            setSuccessMessage("Registrazione avvenuta con successo! Controlla la tua posta per confermare l'email e completare la registrazione.");
        }
    }


    return(
        <div className="flex flex-col justify-center items-center min-h-screen py-8">
            <div className="flex flex-col gap-4 bg-slate-50 border-2 border-slate-300 dark:border-slate-400 dark:bg-slate-800 rounded-lg px-8 py-4 w-full max-w-md">

            {successMessage ? (<p className="text-green-600">{successMessage}</p>) : (

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <h1>Form di registrazione</h1>

                    <CustomInput label="Nome" type="text" name="firstName" placeholder="Nome" value={contact.firstName} onChange={handleChange} />
                    <CustomInput label="Cognome" type="text" name="lastName" placeholder="Cognome" value={contact.lastName} onChange={handleChange} />
                    <CustomInput label="Email" type="email" name="email" placeholder="Email" value={contact.email} onChange={handleChange} />
                    <CustomInput label="Password" type="password" name="password" placeholder="Password" value={contact.password} onChange={handleChange} />
                    <CustomInput label="Codice Invito" type="text" name="slug" placeholder="Slug" value={contact.slug} onChange={handleChange} />

                    {errorMessage && <p className="text-red-600">{errorMessage}</p>}

                    <button type="submit" className="bg-indigo-600 text-white rounded-md px-4 py-2 hover:bg-indigo-500 cursor-pointer">Registrati</button>
                </form>
            )}

            </div>
        </div>
    );
}

export default Registrazione;