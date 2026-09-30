export type EmailCredentialHealth = "READABLE" | "DISABLED" | "INCOMPLETE" | "UNREADABLE";

// Convert provider/server errors to fixed, safe explanations. Never return the
// original error: it may contain addresses, tokens or request payloads.
export function emailFailureDiagnosis(error: string | null | undefined, pending = false) {
  const message = (error || "").toLowerCase();
  const common = "Abra a configuração e use Enviar teste para validar um novo envio. O teste não reenvia este aviso nem apaga a tentativa com erro.";
  let cause = "O envio falhou, mas o registro não permite identificar a causa com segurança.";
  let step = "Confira remetente e destinatário. Se o teste falhar, encaminhe a mensagem exibida ao responsável técnico.";
  if (pending) {
    cause = "A tentativa ficou sem conclusão por mais de 30 minutos. Não há confirmação de envio.";
    step = "Confira se chegou uma mensagem antes de solicitar reenvio, para evitar duplicidade.";
  } else if (/authenticate data|credencial|criptografia/.test(message)) {
    cause = "Naquela tentativa, o servidor não conseguiu ler a chave de e-mail salva. Não é falta de cadastro do destinatário.";
    step = "Se o teste atual funcionar, não troque a chave: esta é uma falha anterior. Se indicar credencial ilegível, um gerente deve salvar novamente a API key do Resend ou pedir revisão da chave de criptografia do servidor. Nunca envie chaves no chat.";
  } else if (/api.?key|unauthori[sz]ed|invalid.*key|authentication|401/.test(message)) {
    cause = "O provedor recusou a autenticação da chave de envio.";
    step = "Um gerente deve conferir se a API key do Resend está ativa e tem permissão de envio; se necessário, substituí-la na configuração.";
  } else if (/domain|dom[ií]nio|verified|verificad|sender|remetente/.test(message)) {
    cause = "O provedor recusou o remetente ou a verificação do domínio.";
    step = "Confira o remetente cadastrado e a verificação do domínio no Resend antes de enviar novamente.";
  } else if (/rate.?limit|too many|429|quota/.test(message)) {
    cause = "O provedor limitou a quantidade de envios.";
    step = "Confira a cota no Resend e aguarde a liberação do limite antes de testar novamente.";
  } else if (/timeout|timed out|fetch failed|network|econn/.test(message)) {
    cause = "A comunicação com o provedor de e-mail não foi concluída.";
    step = "Confira a disponibilidade do provedor. Uma falha de rede não garante que a mensagem deixou de chegar.";
  } else if (/configure a chave/.test(message)) {
    cause = "A configuração de envio estava incompleta ou desativada naquela tentativa.";
    step = "Confira se o envio está ativo, com remetente e API key preenchidos.";
  }
  return { cause, steps: [common, step], actionLabel: "Configurar e-mail" };
}
