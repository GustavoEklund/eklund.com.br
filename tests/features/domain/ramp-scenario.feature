# language: pt
Funcionalidade: Rampa do teste de carga
  O teste dura 20 segundos: sobe por 5, segura o pico por 10 e desce por 5.

  Cenário: A rampa tem três estágios
    Então a rampa dura 20 segundos
    E a rampa tem os estágios:
      | duração | alvo |
      | 5       | 1    |
      | 10      | 1    |
      | 5       | 0    |

  Esquema do Cenário: A carga em cada instante do teste
    Quando se passam <segundos> segundos de teste
    Então a carga está em <porcentagem>% do pico

    Exemplos: subida
      | segundos | porcentagem |
      | 0        | 0           |
      | 1        | 20          |
      | 2,5      | 50          |
      | 5        | 100         |

    Exemplos: pico
      | segundos | porcentagem |
      | 7        | 100         |
      | 10       | 100         |
      | 15       | 100         |

    Exemplos: descida e fim
      | segundos | porcentagem |
      | 17,5     | 50          |
      | 20       | 0           |
      | 25       | 0           |
