import {useAuth} from "../context/AuthContext";
import {Link} from "react-router";


function Landing(){

const {isLogged, isSessionChecked}=useAuth();

    return(
        <div className="flex flex-col gap-6 max-w-3xl mx-auto px-8 py-12">
            <h1 className="text-4xl font-bold">Coworking-SaaS</h1>
            <p className="text-lg text-slate-600 dark:text-slate-300">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus sem ex, lacinia a feugiat sit amet, ornare non nunc. Nam fringilla, lectus at semper bibendum, erat magna pellentesque orci, id tincidunt leo nulla id tortor. Sed pretium sagittis mauris ut imperdiet. Donec ut mi a urna lobortis hendrerit ac non nisi. Duis convallis sapien velit, vitae tristique massa condimentum et. Aenean dapibus sem ac nulla commodo suscipit vel a est. In porttitor vitae sapien ac vehicula. Morbi bibendum ullamcorper risus, vestibulum accumsan magna efficitur ac. Quisque est ipsum, bibendum vel nibh at, blandit scelerisque odio. Suspendisse vel tempor nulla. Pellentesque varius eu neque eu vulputate. Sed eu sem dictum, luctus velit ac, eleifend nibh.</p>

            <div className="min-h-12 flex flex-col gap-3 items-start">
                {isSessionChecked && (
                    isLogged
                    ? <Link to="/private" className="bg-indigo-600 text-white rounded-md px-4 py-2 hover:bg-indigo-500">Area personale</Link>
                    : <><Link to="/login" className="bg-indigo-600 text-white rounded-md px-4 py-2 hover:bg-indigo-500">Accedi</Link>
                        <p className="text-sm">Hai ricevuto un codice invito? Completa la <Link to="/registrazione" className="text-indigo-600 dark:text-indigo-400 underline">registrazione</Link></p>
                        </>
                )} </div>
        </div>
    );
}

export default Landing;