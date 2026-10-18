# language: pt
Funcionalidade: Memória do motor para EndToEndIds repetidos
  Para não crescer sem limite, o motor guarda no máximo 300 mil EndToEndIds. Quando passa disso, esquece todos.

  Contexto:
    Dado um motor Pix novo

  Cenário: Com 300 mil EndToEndIds distintos o motor ainda lembra do primeiro
    Quando o motor processa 300000 pagamentos com EndToEndIds distintos
    Então o pagamento com o EndToEndId "S0" é barrado como duplicado

  Cenário: Ao passar de 300 mil o motor esquece os anteriores e aceita o primeiro de novo
    Quando o motor processa 300001 pagamentos com EndToEndIds distintos
    Então o pagamento com o EndToEndId "S0" é aceito

  Cenário: O último EndToEndId processado continua protegido na virada da memória
    # O conjunto é esvaziado antes de inserir o id atual, então o id que provocou a virada fica guardado
    # e um reenvio imediato dele é barrado.
    Quando o motor processa 300001 pagamentos com EndToEndIds distintos
    Então o pagamento com o EndToEndId "S300000" é barrado como duplicado
