 interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement>{
    label:string;
}

function CustomInput({label, ...props}:CustomInputProps){
    return(
        <div>
            <label className="flex flex-col gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
                <input className="rounded-md border-2 border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none dark:border-slate-500 dark:focus:ring-indigo-400 px-4 py-2 placeholder-slate-400 dark:placeholder-slate-500" {...props} />
            </label>
        </div>
    )
}

export default CustomInput;