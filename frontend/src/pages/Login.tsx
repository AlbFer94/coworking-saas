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



    return(
        <div className="dark:bg-black dark:text-white">
            <h1>Login Form</h1>
            <form onSubmit={handleSubmit}>
                <CustomInput label="Email" onChange={handleChange} name="email" type="email" placeholder="Email" value={userData.email} />
                <CustomInput label="Password" onChange={handleChange} name="password" type="password" placeholder="Password" value={userData.password} />

                {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

                <button type="submit">Login</button>
            </form>
        </div>
    );
}

export default Login;