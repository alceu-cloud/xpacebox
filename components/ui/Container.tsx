import { ReactNode } from "react";

type ContainerProps = {
  children: ReactNode;
};

export default function Container({
  children,
}: ContainerProps) {
  return (
    <div
      style={{
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
}