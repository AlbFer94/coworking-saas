import {useAuth} from "../context/AuthContext";
import {Link} from "react-router";


function Landing(){

const {isLogged, isSessionChecked}=useAuth();

    return(
        <div>
            <h1>Coworking-SaaS</h1>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus sem ex, lacinia a feugiat sit amet, ornare non nunc. Nam fringilla, lectus at semper bibendum, erat magna pellentesque orci, id tincidunt leo nulla id tortor. Sed pretium sagittis mauris ut imperdiet. Donec ut mi a urna lobortis hendrerit ac non nisi. Duis convallis sapien velit, vitae tristique massa condimentum et. Aenean dapibus sem ac nulla commodo suscipit vel a est. In porttitor vitae sapien ac vehicula. Morbi bibendum ullamcorper risus, vestibulum accumsan magna efficitur ac. Quisque est ipsum, bibendum vel nibh at, blandit scelerisque odio. Suspendisse vel tempor nulla. Pellentesque varius eu neque eu vulputate. Sed eu sem dictum, luctus velit ac, eleifend nibh.</p>
            
            <div className="min-h-12">
                {isSessionChecked && (
                    isLogged
                    ? <Link to="/private">Area personale</Link>
                    : <><Link to="/login">Accedi</Link>
                        <p>Hai ricevuto un codice invito? Completa la <Link to="/registrazione">registrazione</Link></p>
                        </>
                )} </div>
        </div>
    );
}

export default Landing;