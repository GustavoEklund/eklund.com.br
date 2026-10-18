# language: pt
@ui
Funcionalidade: Paleta de comandos
  Ctrl+K abre uma busca de comandos que leva o visitante a qualquer seção.

  Cenário: O visitante abre a paleta pelo teclado e pula para uma seção
    Dado que o visitante abre o site
    Quando o visitante aperta Ctrl+K
    Então a paleta de comandos está aberta
    Quando o visitante digita "Ir para Teste de carga" e aperta Enter
    Então a paleta de comandos está fechada
    E a janela está mostrando a seção "carga"
