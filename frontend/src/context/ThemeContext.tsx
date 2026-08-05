import React,{ createContext, useState, useContext, useEffect } from "react";

interface ThemeProviderProps{
    children:React.ReactNode
}

type ThemeContextType={
    isDark:boolean;
    toggleTheme:()=>void;
}

const ThemeContext=createContext<ThemeContextType | undefined>(undefined);

export const useTheme=()=>{
    const context=useContext(ThemeContext);

    if(context === undefined){
        throw new Error("un componente ha chiamato useTheme fuori da ThemeProvider");
    }

    return context;
}

const ThemeProvider=({ children }:ThemeProviderProps)=>{

    const [isDark, setIsDark]=useState(() =>{

    const storedTheme=localStorage.getItem("theme");
    return storedTheme ? storedTheme === "dark" : false;
  });

    useEffect(() => {
    localStorage.setItem("theme", isDark ? "dark" : "light");

    const root=window.document.documentElement;

    if (isDark){
        root.classList.add("dark");
    }else{
        root.classList.remove("dark");
    }
  },[isDark]);

    const toggleTheme = () => setIsDark(prevValue => !prevValue);

    const value:ThemeContextType={
        isDark,
        toggleTheme
    }

    return(
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );

}

export default ThemeProvider;