import { useEffect, useState } from "react";
import {supabase} from "../lib/supabase";
import {useNavigate} from "react-router";
import {useAuth} from "../context/AuthContext";
import CustomInput from "../components/CustomInput";

function Login(){

    const [userData, setUserData]= useState({
        email:"",
        password:""
    });

    const [errorMessage, setErrorMessage]=useState<string | null>(null);
    const [successMessage, setSuccessMessage]=useState<string |null>(null);


    const {isLogged}=useAuth();
    const navigate=useNavigate();

    useEffect(()=>{
        if (isLogged){
            navigate("/private");
        }
    },[isLogged, navigate]);

    async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>){
        event.preventDefault();
        const {error}=await supabase.auth.signInWithPassword({
            email:userData.email,
            password:userData.password
        });

        if (error?.code === 'invalid_credentials') {
            console.error("Credenziali non valide. Controlla email e password.");
            setErrorMessage("Credenziali non valide. Controlla email e password.");
        }else if (error){
            console.error("Errore durante il login:", error.message);
            setErrorMessage(error.message);
        }else{
            setErrorMessage(null);
            //Logica per reinderizzare l'utente alla dashboard 
        }
    }

    function handleChange(event: React.ChangeEvent<HTMLInputElement>){
        const {name, value}=event.target;
        setUserData((prevValue)=>{
            return{
                ...prevValue,
                [name]:value,
            };
        });
    }

    async function handleResetPassword(event: React.MouseEvent<HTMLButtonElement>) {
        event.preventDefault();

        if (!userData.email) {
            setErrorMessage("Inserisci l'email per recuperare la password.");
            return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(userData.email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
            console.error("Errore durante il reset password:", error.message);
            setErrorMessage(error.message);
            return;
        }

        setErrorMessage(null);
        setSuccessMessage("Controlla la tua email per il link di recupero.")
    }

    return(
        <div className="flex flex-col justify-center items-center min-h-screen">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-slate-50 border-2 border-slate-300 dark:border-slate-400 dark:bg-slate-800 rounded-lg px-8 py-4 w-full max-w-md">
                <h1>Login Form</h1>
                <CustomInput label="Email" onChange={handleChange} name="email" type="email" placeholder="Email" value={userData.email} />
                <CustomInput label="Password" onChange={handleChange} name="password" type="password" placeholder="Password" value={userData.password} />

                {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

                <button type="submit" className="bg-indigo-600 text-white rounded-md px-4 py-2 hover:bg-indigo-500 cursor-pointer">Login</button>
                <button  onClick={handleResetPassword} name="resetPassword" type="button">Recupera Password</button>
                
                {successMessage && <p style={{ color: "green" }}>{successMessage}</p>}

            </form>
        </div>
    );
}

export default Login;