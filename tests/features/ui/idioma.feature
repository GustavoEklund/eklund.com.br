# language: pt
@ui
Funcionalidade: Idioma do site
  Cada idioma tem a sua página: "/" em português e "/en/" em inglês. O site abre a página do endereço, oferece a página em inglês a quem tem o navegador em inglês, deixa o visitante trocar e lembra da escolha na próxima visita.

  Cenário: Quem tem o navegador em inglês fica na página em português e recebe a oferta da página em inglês
    Dado que o navegador do visitante está em inglês
    Quando o visitante abre o site
    Então o endereço é "/"
    E a página está em "pt-BR"
    E a oferta da página em inglês está visível
    Quando o visitante aceita a oferta da página em inglês
    Então a página está em "en-US"
    E o endereço é "/en/"
    E o link "EN" do seletor de idioma está marcado como atual
    E a oferta da página em inglês está escondida

  Cenário: O visitante troca para inglês e a escolha fica salva
    Dado que o navegador do visitante está em português
    Quando o visitante abre o site
    Então a página está em "pt-BR"
    E o link "PT" do seletor de idioma está marcado como atual
    Quando o visitante clica em "EN" no seletor de idioma
    Então a página está em "en-US"
    E o endereço é "/en/"
    E o título da página é o do dicionário "en-US"
    Quando o visitante abre o site
    Então o endereço é "/en/"
    E a página está em "en-US"

  Cenário: A página em inglês abre em inglês, seja qual for o navegador
    Dado que o navegador do visitante está em português
    Quando o visitante abre "/en/"
    Então a página está em "en-US"
    E o link "EN" do seletor de idioma está marcado como atual
    E o título da página é o do dicionário "en-US"

  Cenário: O endereço antigo da versão em inglês, com ?lang=en, leva à página em inglês
    Dado que o navegador do visitante está em português
    Quando o visitante abre "/?lang=en"
    Então o endereço é "/en/"
    E a página está em "en-US"
