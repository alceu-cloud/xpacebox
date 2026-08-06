type PageTitleProps = {
  titulo: string;
  descricao?: string;
};

export default function PageTitle({
  titulo,
  descricao,
}: PageTitleProps) {
  return (
    <div
      style={{
        marginBottom: 30,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 34,
          fontWeight: 700,
        }}
      >
        {titulo}
      </h1>

      {descricao && (
        <p
          style={{
            marginTop: 8,
            color: "#6b7280",
            fontSize: 16,
          }}
        >
          {descricao}
        </p>
      )}
    </div>
  );
}