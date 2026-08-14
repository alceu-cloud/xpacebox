import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type FloatingBox = {
  type: "front" | "iso";
  left: string;
  top: string;
  size: number;
  rotate: string;
  opacity: number;
  stroke: string;
  lid: string;
  delay: string;
  duration: string;
  x: string;
  y: string;
};

const floatingBoxes: FloatingBox[] = [
  { type: "front", left: "4%", top: "16%", size: 132, rotate: "-5deg", opacity: 0.78, stroke: "#e68019", lid: "#e68019", delay: "0s", duration: "5.4s", x: "28px", y: "-42px" },
  { type: "iso", left: "17%", top: "48%", size: 122, rotate: "-9deg", opacity: 0.64, stroke: "#8f63f4", lid: "#f2a744", delay: "-1.4s", duration: "5.8s", x: "-24px", y: "-36px" },
  { type: "front", left: "9%", top: "76%", size: 88, rotate: "1deg", opacity: 0.48, stroke: "#b899ff", lid: "#b899ff", delay: "-3s", duration: "6.2s", x: "22px", y: "-30px" },
  { type: "iso", left: "82%", top: "19%", size: 152, rotate: "5deg", opacity: 0.74, stroke: "#8f63f4", lid: "#e68019", delay: "-.8s", duration: "5.6s", x: "-30px", y: "-44px" },
  { type: "front", left: "77%", top: "57%", size: 112, rotate: "-3deg", opacity: 0.66, stroke: "#e68019", lid: "#e68019", delay: "-2.1s", duration: "5.1s", x: "26px", y: "-34px" },
  { type: "iso", left: "87%", top: "82%", size: 96, rotate: "4deg", opacity: 0.48, stroke: "#b899ff", lid: "#b899ff", delay: "-4s", duration: "6.4s", x: "-22px", y: "-32px" },
  { type: "front", left: "23%", top: "22%", size: 74, rotate: "10deg", opacity: 0.34, stroke: "#e63dae", lid: "#ff3b25", delay: "-.9s", duration: "5.9s", x: "16px", y: "-24px" },
  { type: "iso", left: "29%", top: "72%", size: 82, rotate: "-8deg", opacity: 0.32, stroke: "#6f32d2", lid: "#e63dae", delay: "-2.8s", duration: "6.8s", x: "-18px", y: "-26px" },
  { type: "front", left: "69%", top: "13%", size: 76, rotate: "-7deg", opacity: 0.3, stroke: "#ff3b25", lid: "#e63dae", delay: "-1.9s", duration: "6.1s", x: "20px", y: "-28px" },
  { type: "iso", left: "67%", top: "74%", size: 86, rotate: "8deg", opacity: 0.34, stroke: "#6f32d2", lid: "#ff3b25", delay: "-3.7s", duration: "6.6s", x: "-18px", y: "-28px" },
  { type: "front", left: "-6%", top: "2%", size: 230, rotate: "-12deg", opacity: 0.16, stroke: "#e68019", lid: "#ff3b25", delay: "-.5s", duration: "7.2s", x: "34px", y: "-46px" },
  { type: "iso", left: "2%", top: "36%", size: 214, rotate: "8deg", opacity: 0.14, stroke: "#6f32d2", lid: "#e63dae", delay: "-2.4s", duration: "7.8s", x: "-28px", y: "-42px" },
  { type: "front", left: "14%", top: "63%", size: 198, rotate: "5deg", opacity: 0.13, stroke: "#b899ff", lid: "#e68019", delay: "-4.2s", duration: "8.2s", x: "30px", y: "-38px" },
  { type: "iso", left: "88%", top: "2%", size: 238, rotate: "10deg", opacity: 0.16, stroke: "#6f32d2", lid: "#e68019", delay: "-1.2s", duration: "7.1s", x: "-36px", y: "-48px" },
  { type: "front", left: "82%", top: "34%", size: 220, rotate: "-8deg", opacity: 0.14, stroke: "#ff3b25", lid: "#e63dae", delay: "-3s", duration: "7.7s", x: "30px", y: "-44px" },
  { type: "iso", left: "73%", top: "66%", size: 202, rotate: "-3deg", opacity: 0.13, stroke: "#b899ff", lid: "#ff3b25", delay: "-5s", duration: "8.4s", x: "-32px", y: "-40px" },
];

export default function LoginBackground({ children }: Props) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 16% 12%, rgba(111,50,210,.12), transparent 32%), radial-gradient(circle at 88% 82%, rgba(255,59,37,.12), transparent 34%), linear-gradient(135deg,#ffffff 0%,#f8f7ff 45%,#eef4ff 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(120deg, rgba(111,50,210,.04) 0 1px, transparent 1px 46px), linear-gradient(120deg, rgba(255,59,37,.03) 0 1px, transparent 1px 58px)",
          maskImage:
            "linear-gradient(90deg, rgba(0,0,0,.72), transparent 36%, transparent 64%, rgba(0,0,0,.64))",
        }}
      />

      {floatingBoxes.map((box, index) => (
        <AnimatedBox key={index} {...box} />
      ))}

      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 1400,
          padding: 40,
        }}
      >
        {children}
      </div>
    </main>
  );
}

function AnimatedBox({
  type,
  left,
  top,
  size,
  rotate,
  opacity,
  stroke,
  lid,
  delay,
  duration,
  x,
  y,
}: FloatingBox) {
  return (
    <div
      className="login-box-float"
      style={
        {
          "--box-left": left,
          "--box-top": top,
          "--box-size": `${size}px`,
          "--box-rotate": rotate,
          "--box-opacity": opacity,
          "--float-delay": delay,
          "--float-duration": duration,
          "--float-x": x,
          "--float-y": y,
        } as React.CSSProperties
      }
    >
      {type === "front" ? (
        <FrontBox stroke={stroke} delay={delay} />
      ) : (
        <IsoBox stroke={stroke} lid={lid} delay={delay} />
      )}
    </div>
  );
}

function FrontBox({
  stroke,
  delay,
}: {
  stroke: string;
  delay: string;
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M25 50L75 50L70 85L30 85Z"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M25 50L50 50"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
      >
        <animateTransform attributeName="transform" type="rotate" values="0 25 50; -120 25 50; -120 25 50; 0 25 50" keyTimes="0; .38; .62; 1" dur="4s" begin={delay} repeatCount="indefinite" />
      </path>
      <path
        d="M75 50L50 50"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
      >
        <animateTransform attributeName="transform" type="rotate" values="0 75 50; 120 75 50; 120 75 50; 0 75 50" keyTimes="0; .38; .62; 1" dur="4s" begin={delay} repeatCount="indefinite" />
      </path>
      <Bubble cx="40" cy="45" r="3" fill="#ffd947" delay={delay} />
      <Bubble cx="60" cy="42" r="2.6" fill="#ff3b25" delay={`calc(${delay} + .2s)`} />
      <Bubble cx="50" cy="38" r="2.2" fill="#667085" delay={`calc(${delay} + .4s)`} />
    </svg>
  );
}

function IsoBox({
  stroke,
  lid,
  delay,
}: {
  stroke: string;
  lid: string;
  delay: string;
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon
        points="20,65 50,80 80,65 80,45 50,60 20,45"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <line x1="50" y1="80" x2="50" y2="60" stroke={stroke} strokeWidth="4" />
      <polygon
        points="20,45 50,60 80,45 50,30"
        fill="none"
        stroke={lid}
        strokeWidth="4"
        strokeLinejoin="round"
      >
        <animateTransform attributeName="transform" type="translate" values="0 0; -10 -22; -10 -22; 0 0" keyTimes="0; .38; .62; 1" dur="4s" begin={delay} repeatCount="indefinite" />
        <animateTransform attributeName="transform" additive="sum" type="rotate" values="0 35 37; -30 35 37; -30 35 37; 0 35 37" keyTimes="0; .38; .62; 1" dur="4s" begin={delay} repeatCount="indefinite" />
      </polygon>
    </svg>
  );
}

function Bubble({
  cx,
  cy,
  r,
  fill,
  delay,
}: {
  cx: string;
  cy: string;
  r: string;
  fill: string;
  delay: string;
}) {
  return (
    <circle cx={cx} cy={cy} r={r} fill={fill}>
      <animateTransform attributeName="transform" type="translate" values="0 15; 0 -35; 0 15" keyTimes="0; .5; 1" dur="4s" begin={delay} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0; .9; 0" keyTimes="0; .5; 1" dur="4s" begin={delay} repeatCount="indefinite" />
    </circle>
  );
}
