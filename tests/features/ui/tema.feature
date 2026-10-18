# language: pt
@ui
Funcionalidade: Tema claro e escuro
  O site abre escuro, o visitante alterna no botão do menu e a escolha vale na próxima visita.

  Cenário: O visitante troca o tema e a escolha fica salva
    Dado que o visitante abre o site
    Então o tema da página é "dark"
    Quando o visitante clica no botão de tema
    Então o tema da página é "light"
    Quando o visitante recarrega a página
    Então o tema da página é "light"
