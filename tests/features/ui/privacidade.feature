# language: pt
@ui
Funcionalidade: Aviso de privacidade
  Na primeira visita, um aviso fixo embaixo da tela diz o que o site mede e pergunta se o visitante aceita a gravação de sessão. A escolha fica no navegador por seis meses, e o link de preferências no rodapé muda a escolha depois.

  Cenário: O visitante recusa tudo e o aviso não volta
    Dado que o visitante abre o site
    Então o aviso de privacidade está visível
    Quando o visitante clica em "Recusar tudo" no aviso de privacidade
    Então o aviso de privacidade está escondido
    E a medição anônima está desligada
    Quando o visitante recarrega a página
    Então o aviso de privacidade está escondido

  Cenário: O visitante liga a gravação de sessão nas preferências
    Dado que o visitante abre o site
    Quando o visitante clica em "Escolher" no aviso de privacidade
    Então as preferências de privacidade estão abertas
    Quando o visitante liga "Gravação de sessão e mapa de calor" e salva a escolha
    Então o aviso de privacidade está escondido
    E a gravação de sessão está ligada

  Cenário: O visitante muda a escolha depois, pelo link do rodapé
    Dado que o visitante abre o site
    E o visitante clica em "Aceitar tudo" no aviso de privacidade
    Quando o visitante clica em "Preferências de privacidade" no rodapé
    Então as preferências de privacidade estão abertas
    Quando o visitante clica em "Recusar tudo" nas preferências de privacidade
    Então a medição anônima está desligada
    E a gravação de sessão está desligada

  Cenário: Um navegador com Global Privacy Control não vê o aviso
    Dado que o navegador do visitante envia o sinal Global Privacy Control
    Quando o visitante abre o site
    Então o aviso de privacidade está escondido
    E a medição anônima está desligada
