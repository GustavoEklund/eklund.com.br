# language: pt
Funcionalidade: Diário do motor Pix
  Cada pagamento aceito entra no diário e muda a cadeia de hashes. O que foi recusado não deixa rastro.

  Contexto:
    Dado um motor Pix novo

  Cenário: Um motor sem pagamentos tem o diário vazio e a cadeia no valor inicial do FNV-1a
    Então o diário tem 0 lançamentos
    E a cadeia do diário vale "811c9dc5"

  Cenário: Só o pagamento aceito entra no diário
    Quando chega a mensagem {"endToEndId":"E1","from":1,"to":2,"amount":10,"timestamp":1}
    Então o pagamento é aceito
    E a cadeia do diário vale "a0bd0057"
    E o diário tem 1 lançamento
    Quando chega a mensagem {"endToEndId":"E1","from":1,"to":2,"amount":10,"timestamp":2}
    Então o pagamento é barrado como duplicado
    Quando chega a mensagem {"endToEndId":"E2","from":1,"to":1,"amount":10,"timestamp":3}
    Então o pagamento é recusado como inválido
    Dado que a conta 0 está sem saldo
    Quando chega a mensagem {"endToEndId":"E3","from":0,"to":2,"amount":10,"timestamp":4}
    Então o pagamento é recusado por falta de saldo
    E a cadeia do diário vale "a0bd0057"
    E o diário tem 1 lançamento

  Cenário: A cadeia é a mesma para as mesmas mensagens e muda com a ordem delas
    Quando um motor novo recebe as mensagens, nesta ordem:
      | {"endToEndId":"E1","from":1,"to":2,"amount":10,"timestamp":1} |
      | {"endToEndId":"E2","from":3,"to":4,"amount":20,"timestamp":2} |
    Então a cadeia do diário vale "f496c236"
    Quando um motor novo recebe as mensagens, nesta ordem:
      | {"endToEndId":"E1","from":1,"to":2,"amount":10,"timestamp":1} |
      | {"endToEndId":"E2","from":3,"to":4,"amount":20,"timestamp":2} |
    Então a cadeia do diário vale "f496c236"
    Quando um motor novo recebe as mensagens, nesta ordem:
      | {"endToEndId":"E2","from":3,"to":4,"amount":20,"timestamp":2} |
      | {"endToEndId":"E1","from":1,"to":2,"amount":10,"timestamp":1} |
    Então a cadeia do diário vale "f01cc438"
