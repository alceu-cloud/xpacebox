"use client";

import { DoorOpen } from "lucide-react";

export default function SettingsWorkspace({ onOpenRooms }: { onOpenRooms: () => void }) {
  return <section className="xd-administration"><header className="xd-administration-title"><span>PARÂMETROS DA ESCOLA</span><h1>CONFIGURAÇÕES.</h1><p>Cadastros que organizam os recursos físicos e as regras de operação da escola.</p></header><div className="xd-administration-grid xd-administration-grid--single"><button type="button" className="xd-administration-card" onClick={onOpenRooms} title="Abrir salas"><span><DoorOpen size={22} /></span><strong>SALAS</strong><small>Espaços disponíveis para as grades de horários</small></button></div></section>;
}
