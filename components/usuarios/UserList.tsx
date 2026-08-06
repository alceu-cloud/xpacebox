import UserCard from "./UserCard";

type User = {
  id: string;
  full_name: string | null;
  platform_role: string;
  active: boolean;
};

type Props = {
  users: User[];
  onEditar: (user: User) => void;
  onExcluir: (user: User) => void;
};

function traduzPerfil(perfil: string) {
  switch (perfil) {
    case "platform_owner":
      return "Administrador";

    case "company_manager":
      return "Gerente";

    default:
      return "Usuário";
  }
}

export default function UserList({
  users,
  onEditar,
  onExcluir,
}: Props) {
  return (
    <div
      style={{
        display: "grid",
        gap: 18,
      }}
    >
      {users.map((user) => (
        <UserCard
          key={user.id}
          nome={user.full_name ?? "Sem nome"}
          perfil={traduzPerfil(user.platform_role)}
          ativo={user.active}
          onEditar={() => onEditar(user)}
          onExcluir={() => onExcluir(user)}
        />
      ))}
    </div>
  );
}