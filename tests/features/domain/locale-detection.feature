# language: pt
@locale
Funcionalidade: Escolha do idioma do site
  Cada idioma tem a sua página: "/" em português e "/en/" em inglês. Quem abre a página em português só é levado à página em inglês quando escolheu inglês: pelo endereço ou numa visita anterior. O idioma do navegador sozinho não leva ninguém; ele só decide se a página em português oferece a página em inglês.

  Esquema do Cenário: O idioma da página de cada endereço
    Dado a página no endereço "<endereço>"
    Quando o site detecta o idioma
    Então o idioma é "<idioma>"

    Exemplos:
      | endereço       | idioma |
      | /              | pt-BR  |
      | /index.html    | pt-BR  |
      | /en/           | en-US  |
      | /en            | en-US  |
      | /en/index.html | en-US  |
      | /english       | pt-BR  |
      | /enigma/       | pt-BR  |

    Exemplos: a cópia de uma versão na sua pasta segue a mesma regra
      | endereço      | idioma |
      | /1.1.0/       | pt-BR  |
      | /1.1.0/en/    | en-US  |
      | /1.1.0/enigma | pt-BR  |

  Esquema do Cenário: Quem é levado para a página em inglês
    Dado um visitante em "<endereço>", com a escolha salva "<salva>" e o navegador com "<navegador>"
    Quando a página começa a abrir
    Então o visitante vai para "<destino>"

    Exemplos: o endereço vence
      | endereço                | salva | navegador | destino            |
      | /?lang=en               | pt-BR | pt-BR     | /en/               |
      | /?x=1&lang=en&y=2#carga |       | pt-BR     | /en/?x=1&y=2#carga |

    Exemplos: a escolha salva leva, qualquer que seja o navegador
      | endereço  | salva | navegador | destino    |
      | /         | en-US | pt-BR     | /en/       |
      | /#carga   | en-US | en-US     | /en/#carga |
      | /?lang=fr | en-US | pt-BR     | /en/       |

  Esquema do Cenário: Quem fica na página em português
    Dado um visitante em "<endereço>", com a escolha salva "<salva>" e o navegador com "<navegador>"
    Quando a página começa a abrir
    Então o visitante fica onde está

    Exemplos: o endereço vence
      | endereço  | salva | navegador |
      | /?lang=pt | en-US | en-US     |

    Exemplos: a escolha salva vence o navegador
      | endereço | salva | navegador |
      | /        | pt-BR | en-US     |

    Exemplos: o navegador em inglês não leva ninguém
      | endereço  | salva   | navegador   |
      | /         |         | en-US       |
      | /         |         | en-GB,pt-BR |
      | /         | klingon | en-GB       |
      | /?lang=fr |         | en-GB       |

    Exemplos: sem nada que o site traduza, o padrão
      | endereço | salva | navegador   |
      | /        |       | fr-FR,de-DE |
      | /        |       |             |

    Exemplos: a página em inglês já é a página em inglês
      | endereço | salva | navegador |
      | /en/     | pt-BR | pt-BR     |
      | /en/     | en-US | en-US     |

  Esquema do Cenário: Quem vê a oferta da página em inglês
    Dado um visitante da página "<página>", com a escolha salva "<salva>" e o navegador com "<navegador>"
    Quando a página termina de abrir
    Então a oferta da página em inglês <aparece>

    Exemplos: um navegador que prefere inglês, sem escolha feita
      | página | salva | navegador   | aparece     |
      | pt-BR  |       | en-US       | aparece     |
      | pt-BR  |       | en-GB,pt-BR | aparece     |
      | pt-BR  |       | de,en-AU    | aparece     |

    Exemplos: quem já escolheu, ou prefere outro idioma, não vê
      | página | salva | navegador   | aparece     |
      | pt-BR  | pt-BR | en-US       | não aparece |
      | pt-BR  | en-US | en-US       | não aparece |
      | pt-BR  |       | pt-PT,en-US | não aparece |
      | pt-BR  |       | fr-FR       | não aparece |
      | en-US  |       | en-US       | não aparece |

  Esquema do Cenário: Um robô de busca fica onde está e não vê a oferta, para a página em português ser a indexada em "/"
    Dado um robô de busca em "<endereço>" com o navegador com "en-US"
    Quando a página começa a abrir
    Então o visitante fica onde está
    E a oferta da página em inglês não aparece para ele

    Exemplos:
      | endereço |
      | /        |

  Cenário: Um robô de busca que segue um link com ?lang=en vai para a página em inglês, porque isso é um endereço e não um palpite
    Dado um robô de busca em "/?lang=en" com o navegador com "en-US"
    Quando a página começa a abrir
    Então o visitante vai para "/en/"

  Cenário: A escolha do visitante vira a escolha salva e vale na visita seguinte
    Dado um visitante em "/", com a escolha salva "" e o navegador com "pt-BR"
    Quando o visitante escolhe "en-US"
    Então a escolha salva é "en-US"
    E ao voltar com o mesmo navegador à página em português, o visitante vai para "/en/"

  Esquema do Cenário: O link da página em cada idioma
    Quando o site monta o link de "<página>" em "<idioma>"
    Então o link é "<link>"

    Exemplos:
      | página                                | idioma | link                  |
      | https://eklund.com.br/                | en-US  | /en/                  |
      | https://eklund.com.br/en/             | pt-BR  | /                     |
      | https://eklund.com.br/?lang=pt        | pt-BR  | /                     |
      | https://eklund.com.br/#carga          | en-US  | /en/#carga            |
      | https://eklund.com.br/en/?x=1#carga   | pt-BR  | /?x=1#carga           |
      | https://eklund.com.br/?utm=x#carga    | en-US  | /en/?utm=x#carga      |
