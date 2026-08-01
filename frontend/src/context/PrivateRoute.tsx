import type {ReactNode} from "react";
import {useAuth} from "./AuthContext";
import {Navigate} from "react-router";

const PrivateRoute = ({children}: {children: ReactNode}) => {
    const {isLogged, isSessionChecked}=useAuth();

    if (!isSessionChecked){
        return null; //Non mostro nulla finchè non ho controllato se l'utente è loggato o meno. In questo modo evito di mostrare la pagina di login per un attimo prima di reindirizzare l'utente loggato alla home.
    }else if (!isLogged){
        return <Navigate to="/login" replace={true}/>
    }else {
        return children;
    }
}

export default PrivateRoute;