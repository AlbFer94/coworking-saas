import {useTheme} from "../context/ThemeContext";
import {useAuth} from "../context/AuthContext";
import {Link} from "react-router";

function Header(){

const {isDark,toggleTheme}=useTheme();
const {isLogged, logout}=useAuth();


return(
    <header className="fixed top-0 left-0 right-0 bg-slate-300 dark:bg-slate-700 border-b-2 border-slate-400 flex justify-between items-center gap-4 px-8 py-4">
        <h1>COWORKING-SAAS</h1>
        <div className="flex gap-4">
        <button className="cursor-pointer" onClick={toggleTheme}>{isDark ? "🌙" : "☀️"}</button>
        {isLogged ? <button className="bg-indigo-600 text-white rounded-md px-4 py-2 hover:bg-indigo-500 cursor-pointer" onClick={logout}>Logout</button> : <Link to="/login" className="bg-indigo-600 text-white rounded-md px-4 py-2 hover:bg-indigo-500">Accedi</Link>}
        </div>
    </header>
)
}

export default Header;