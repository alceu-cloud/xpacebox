import { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export default function Input({
  style,
  ...props
}: InputProps) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid #d1d5db",
        outline: "none",
        fontSize: 15,
        transition: ".2s",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}