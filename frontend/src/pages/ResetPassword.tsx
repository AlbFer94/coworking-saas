import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import CustomInput from "../components/CustomInput";

function ResetPassword(){

    const [newPassword, setNewPassword]=useState({
        password:"",
        confirmPassword:""
    });

    const [isAllowed, setIsAllowed]=useState(false);

    const [errorMessage, setErrorMessage]=useState<string | null>(null);
    const [successMessage, setSuccessMessage]=useState<string |null>(null);



    useEffect(()=>{
        const {data: {subscription}} = supabase.auth.onAuthStateChange((_event) => {
            if(_event==="PASSWORD_RECOVERY"){
                setIsAllowed(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    function handleChange(event:React.ChangeEvent<HTMLInputElement>){
        const {name, value}=event.target;
        setNewPassword((prevValue)=>{
            return{
                ...prevValue,
                [name]:value
            };
        });
    };

    async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>){
        event.preventDefault();

        if(newPassword.password !== newPassword.confirmPassword){
            setErrorMessage("La password non coincide");
            return
        }

        const {error}=await supabase.auth.updateUser({
            password:newPassword.password,
        });

        if(error){
            setErrorMessage(error.message);
            return;
        }

        setErrorMessage(null);
        setSuccessMessage("Password cambiata con successo vai al Log-in");
    }

    return(
        <div className="flex flex-col justify-center items-center min-h-screen">
            <div className="flex flex-col gap-4 bg-slate-50 border-2 border-slate-300 dark:border-slate-400 dark:bg-slate-800 rounded-lg px-8 py-4 w-full max-w-md">
                {isAllowed ? (<form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <CustomInput label="Nuova Password" onChange={handleChange} name="password" type="password" value={newPassword.password} />
                    <CustomInput label="Conferma Password" onChange={handleChange} name="confirmPassword" type="password" value={newPassword.confirmPassword} />

                    {errorMessage && <p className="text-red-600">{errorMessage}</p>}
                    {successMessage && <p className="text-green-600">{successMessage}</p>}

                <button type="submit" className="bg-indigo-600 text-white rounded-md px-4 py-2 hover:bg-indigo-500 cursor-pointer">Reset Password</button>

                </form>) : <p>Sessione non autorizzata o scaduta</p>}
            </div>
        </div>
    );
}

export default ResetPassword;