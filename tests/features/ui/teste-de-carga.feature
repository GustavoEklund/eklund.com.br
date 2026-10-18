# language: pt
@ui
Funcionalidade: Teste de carga no navegador
  Ao chegar na seção, o teste roda sozinho em Web Workers e termina com cinco checks.

  Cenário: O visitante roda o teste de carga e os cinco checks passam
    Dado que o visitante abre o site
    Quando o visitante vai até o teste de carga e espera ele terminar
    Então o resumo mostra "5 ✓" nos checks
    E o terminal mostra 5 checks aprovados e 0 reprovados
