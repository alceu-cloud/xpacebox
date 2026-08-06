import { ReactNode } from "react";

type GridProps = {
  children: ReactNode;
  minWidth?: number;
};

export default function Grid({
  children,
  minWidth = 280,
}: GridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: 20,
      }}
    >
      {children}
    </div>
  );
}