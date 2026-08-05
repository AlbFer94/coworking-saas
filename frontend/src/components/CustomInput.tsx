 interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement>{
    label:string;
}

function CustomInput({label, ...props}:CustomInputProps){
    return(
        <div>
            <label>{label}
                <input {...props} />
            </label>
        </div>
    )
}

export default CustomInput;