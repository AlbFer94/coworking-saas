import {useTheme} from "../context/ThemeContext";

function Header(){

const {isDark,toggleTheme}=useTheme();


return(
    <header>
        <button onClick={toggleTheme}>{isDark ? "🌙" : "☀️"}</button>
    </header>
)
}

export default Header;