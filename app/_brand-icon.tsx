export default function BrandIcon() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #6f32d2 0%, #e63dae 52%, #ff3b25 100%)",
      }}
    >
      <div
        style={{
          width: "70%",
          height: "70%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "20%",
          background: "#09040d",
        }}
      >
        <svg width="72%" height="72%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22 25L32 19L42 25V37L32 43L22 37V25Z" stroke="#FFFFFF" strokeWidth="4" strokeLinejoin="round" />
          <path d="M22 25L32 31L42 25M32 31V43" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
