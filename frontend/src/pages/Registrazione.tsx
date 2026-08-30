import {useEffect, useState} from "react";
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
    const [isSubmitting, setIsSubmitting]=useState(false);
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

    async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);

        try{
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/signup`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    firstName:contact.firstName,
                    lastName:contact.lastName,
                    email:contact.email,
                    password:contact.password,
                    slug:contact.slug 
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (data?.code === 'EMAIL_UNCONFIRMED') {
                    setErrorMessage("L'email fornita è già stata registrata ma non confermata. Recupera la password per accedere.");
                } else if(data?.code === 'EMAIL_ALREADY_REGISTERED') {
                    setErrorMessage("Email già registrata. Effettua il login.");
                } else if(data?.code === 'INVALID_TENANT_SLUG'){
                    setErrorMessage("Identificativo azienda non valido");
                }else{
                    setErrorMessage(data.error || "Errore durante la registrazione.");
                }
                setSuccessMessage(null);
                return;

            }

            setErrorMessage(null);
            setSuccessMessage(
                data.emailSent
                ? "Registrazione avvenuta con successo! Controlla la tua posta per confermare la tua email."
                : "Registrazione avvenuta con successo, ma non è stato possibile inviare l'email di conferma."
            );
        } catch (err) {
            console.error("Errore di rete durante la registrazione:", err);
            setErrorMessage("Errore di connessione al server.");
            setSuccessMessage(null);
        } finally {
            setIsSubmitting(false);
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

                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white rounded-md px-4 py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:not-disabled:bg-indigo-500">{isSubmitting ? "Registrazione in corso..." : "Registrati"}</button>
                </form>
            )}

            </div>
        </div>
    );
}

export default Registrazione;