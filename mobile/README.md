# XPACE Mobile

Aplicativo nativo Expo/React Native para Android e iPhone. Consome a API já usada pela Agenda web; a chamada de leads altera o mesmo agendamento no CRM, sem criar matrícula.

## Configurar e testar

1. Copie `.env.example` para `.env` e preencha a URL e a chave **publicável** do Supabase. Nunca use `service_role`/secret no aplicativo. A URL de API deve apontar para um deploy que já contenha `/api/xpace/mobile/overview` e a chamada em `/api/xpace/agenda`.
2. Instale as dependências (`pnpm install`) e rode `pnpm start`.
3. Abra o QR Code pelo Expo Go no celular para testar. O usuário precisa ter acesso ativo à empresa XPACE.

## Distribuir para os celulares

Expo Go é apenas para desenvolvimento. Para instalar como app próprio, configure uma conta Expo/EAS, o identificador definitivo do aplicativo, as contas de desenvolvedor Apple/Google e as credenciais de assinatura. O perfil `preview` em `eas.json` gera um APK Android instalável para testes e uma distribuição interna para iPhone (exige dispositivos cadastrados e conta Apple). O perfil `production` gera arquivos destinados às lojas; a publicação exige envio e aprovação separada. Não há builds ou publicação automáticos neste repositório.

## Limites desta primeira entrega

- O sininho mostra agendamentos recentes **dentro** do app; push remoto e central de notificações ainda não estão implementados.
- Financeiro aparece como “não integrado”; não exibe números fictícios.
- A associação de aluno usa a matrícula na **grade**, como faz a Agenda web. Se um aluno frequenta só um horário de uma grade com vários horários, o modelo atual ainda não registra essa distinção; é necessário evoluir essa relação antes de afirmar presença por horário.
- O app não registra presença de alunos. Só os leads têm COMPARECEU/FALTOU.
