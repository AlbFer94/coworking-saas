import {useState} from "react";
import {supabase} from "../lib/supabase";
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
        <div>
            <h1>Form di registrazione</h1>
            <form onSubmit={handleSubmit}>
                <input type="text" name="firstName" placeholder="Nome" value={contact.firstName} onChange={handleChange} />
                <input type="text" name="lastName" placeholder="Cognome" value={contact.lastName} onChange={handleChange} />
                <input type="email" name="email" placeholder="Email" value={contact.email} onChange={handleChange} />
                <input type="password" name="password" placeholder="Password" value={contact.password} onChange={handleChange} />
                <input type="text" name="slug" placeholder="Slug" value={contact.slug} onChange={handleChange} />

                {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
                {successMessage && <p style={{ color: "green" }}>{successMessage}</p>}

                <button type="submit">Registrati</button>
            </form>
        </div>
    );
}

export default Registrazione;