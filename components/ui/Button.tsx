import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export default function Button({
  variant = "primary",
  style,
  children,
  ...props
}: ButtonProps) {
  const primary = variant === "primary";

  return (
    <button
      {...props}
      style={{
        padding: "12px 18px",
        borderRadius: 12,
        border: primary
          ? "none"
          : "1px solid #d1d5db",
        background: primary
          ? "linear-gradient(90deg,#7c3aed,#db2777)"
          : "#ffffff",
        color: primary ? "#ffffff" : "#374151",
        fontWeight: 700,
        cursor: "pointer",
        transition: ".2s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}