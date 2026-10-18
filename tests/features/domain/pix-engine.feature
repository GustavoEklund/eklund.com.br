# language: pt
Funcionalidade: Motor Pix de brinquedo
  O motor recebe uma mensagem por pagamento, recusa o que está fora das regras, barra o EndToEndId repetido,
  move o dinheiro em partidas dobradas e registra cada pagamento aceito numa cadeia de hashes.

  Contexto:
    Dado um motor Pix novo

  Cenário: Um pagamento válido move o valor entre as contas
    Quando a conta 1 paga R$ 10,50 para a conta 2 com o EndToEndId "E1"
    Então o pagamento é aceito
    E a conta 1 fica com R$ 999.989,50
    E a conta 2 fica com R$ 1.000.010,50
    E o diário tem 1 lançamento

  Esquema do Cenário: Uma mensagem fora das regras é recusada e não mexe em nada
    Quando chega a mensagem <mensagem>
    Então o pagamento é recusado como inválido
    E nenhum saldo mudou
    E o dinheiro total no motor continua o mesmo
    E o diário tem 0 lançamentos
    E o relatório conta 1 mensagem inválida

    Exemplos: o que o motor recusa
      | motivo                    | mensagem                                                                   |
      | valor zero                | {"endToEndId":"E1","from":1,"to":2,"amount":0,"timestamp":1}               |
      | valor negativo            | {"endToEndId":"E1","from":1,"to":2,"amount":-5,"timestamp":1}              |
      | valor nulo                | {"endToEndId":"E1","from":1,"to":2,"amount":null,"timestamp":1}            |
      | valor que não é número    | {"endToEndId":"E1","from":1,"to":2,"amount":"abc","timestamp":1}           |
      | origem igual ao destino   | {"endToEndId":"E1","from":1,"to":1,"amount":10,"timestamp":1}              |
      | sem EndToEndId            | {"from":1,"to":2,"amount":10,"timestamp":1}                                |
      | EndToEndId que é número   | {"endToEndId":5,"from":1,"to":2,"amount":10,"timestamp":1}                 |

  Esquema do Cenário: Tipos e contas fora do intervalo também são recusados
    # Um valor em texto viraria concatenação (1000000 + "5" = "10000005"), e uma conta fora de 0 a 9999 ou fracionária
    # receberia sem pagar, ou pagaria sem receber: o dinheiro total mudaria.
    Quando chega a mensagem <mensagem>
    Então o pagamento é recusado como inválido
    E o dinheiro total no motor continua o mesmo

    Exemplos: o que mais o motor recusa
      | motivo                         | mensagem                                                                 |
      | valor em texto com dígitos     | {"endToEndId":"E1","from":1,"to":2,"amount":"5","timestamp":1}           |
      | origem negativa                | {"endToEndId":"E1","from":-1,"to":2,"amount":10,"timestamp":1}           |
      | origem acima da última conta   | {"endToEndId":"E1","from":99999,"to":2,"amount":10,"timestamp":1}        |
      | destino acima da última conta  | {"endToEndId":"E1","from":1,"to":99999,"amount":10,"timestamp":1}        |
      | destino fracionário            | {"endToEndId":"E1","from":1,"to":2.5,"amount":10,"timestamp":1}          |

  Cenário: O mesmo EndToEndId não é processado duas vezes
    Quando a conta 1 paga R$ 10,00 para a conta 2 com o EndToEndId "E1"
    E a conta 1 paga R$ 10,00 para a conta 2 com o EndToEndId "E1"
    Então o pagamento é barrado como duplicado
    E nenhum saldo mudou
    E a conta 1 fica com R$ 999.990,00
    E o diário tem 1 lançamento
    E o relatório conta 1 mensagem duplicada

  Cenário: O EndToEndId manda, mesmo que o resto da mensagem seja outro
    Quando a conta 1 paga R$ 10,00 para a conta 2 com o EndToEndId "E1"
    E a conta 3 paga R$ 99,00 para a conta 4 com o EndToEndId "E1"
    Então o pagamento é barrado como duplicado
    E a conta 3 fica com R$ 1.000.000,00
    E a conta 4 fica com R$ 1.000.000,00

  Cenário: Quem não tem saldo não paga
    Dado que a conta 0 está sem saldo
    Quando a conta 0 paga R$ 1,00 para a conta 3 com o EndToEndId "E7"
    Então o pagamento é recusado por falta de saldo
    E nenhum saldo mudou
    E o diário tem 0 lançamentos
    E o relatório conta 1 pagamento sem saldo

  Cenário: Pagar exatamente o saldo inteiro é aceito
    Quando a conta 1 paga R$ 1.000.000,00 para a conta 2 com o EndToEndId "E1"
    Então o pagamento é aceito
    E a conta 1 fica com R$ 0,00
    E a conta 2 fica com R$ 2.000.000,00

  Cenário: Quem recebeu passa a poder pagar
    Dado que a conta 0 está sem saldo
    Quando a conta 5 paga R$ 100,00 para a conta 0 com o EndToEndId "E1"
    E a conta 0 paga R$ 40,25 para a conta 3 com o EndToEndId "E2"
    Então o pagamento é aceito
    E a conta 0 fica com R$ 59,75

  Cenário: O EndToEndId de um pagamento recusado por falta de saldo fica gasto
    Dado que a conta 0 está sem saldo
    Quando a conta 0 paga R$ 1,00 para a conta 3 com o EndToEndId "E7"
    Então o pagamento é recusado por falta de saldo
    Quando a conta 5 paga R$ 100,00 para a conta 0 com o EndToEndId "E8"
    E a conta 0 paga R$ 1,00 para a conta 3 com o EndToEndId "E7"
    Então o pagamento é barrado como duplicado
    E a conta 0 fica com R$ 100,00

  Cenário: Cinquenta mil pagamentos não criam nem destroem dinheiro
    Quando o motor processa 50 lotes de mil pagamentos
    Então o dinheiro total no motor continua o mesmo
    E o relatório confirma a conservação
    E nenhuma conta ficou negativa

  Cenário: Cada lote de mil pagamentos termina com mil desfechos
    Quando o motor processa 1 lote de mil pagamentos
    Então o relatório tem os contadores:
      | aceitos | sem saldo | duplicados | inválidos |
      | 988     | 4         | 8          | 0         |
    E o relatório soma 1000 desfechos

  Cenário: Com a mesma semente o motor chega sempre ao mesmo relatório
    Quando o motor processa 300 lotes de mil pagamentos
    Então o relatório tem os contadores:
      | aceitos | sem saldo | duplicados | inválidos |
      | 298148  | 236       | 1579       | 37        |
    E o relatório soma 300000 desfechos
    E o diário tem 298148 lançamentos
    E a cadeia do diário vale "ced9a88c"
