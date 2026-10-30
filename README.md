# Assistente SISAGUA SAC

Extensão de navegador para importar textos de laudos, avaliar resultados e apoiar o preenchimento do controle semestral de SAC no SISAGUA.

**Projeto de portfólio · Manifest V3 · lotes iniciais vazios · exemplos fictícios**

## O problema

O lançamento manual de análises exige relacionar parâmetros, unidades, datas e pontos de coleta em categorias diferentes. Nomes semelhantes, resultados com limites de quantificação e telas repetidas tornam o trabalho sujeito a erros.

A extensão organiza os resultados antes do preenchimento e verifica o que ficou salvo. O envio definitivo do formulário continua sob responsabilidade do usuário.

## Funcionalidades

- Importação do texto de uma amostra, com identificação de cliente, ponto, coleta e origem.
- Normalização controlada de nomes e aliases dos parâmetros.
- Avaliação por base legal local versionada, com tratamento de faixas, ausência, limites e regras especiais.
- Conversões de unidades documentadas e preservação do resultado original.
- Separação de resultados conformes, revisões obrigatórias, itens ignorados, duplicidades e pendências.
- Conferência dos cabeçalhos antes de alterar os campos do SISAGUA.
- Validação, salvamento por blocos e reabertura da categoria para verificar o que foi persistido.
- Exportação de registro canônico em JSON para rastreabilidade.
- Persistência dos lotes em `chrome.storage.local`, separada do armazenamento da página.

**A extensão não aciona o envio definitivo do formulário.** O fluxo automatizado é o controle semestral; o protocolo mensal do repositório documenta uma rotina distinta.

## Como funciona

1. Colar o texto de uma amostra fictícia na aba de importação.
2. Extrair e revisar resultados, unidades, ponto e datas.
3. Gerar os lotes e escolher uma categoria.
4. Conferir a proposta antes de preencher.
5. Salvar, reabrir e auditar os campos; exportar o registro de execução.

Resultados fora dos critérios, conflitos e pontos indefinidos ficam identificados para revisão. O programa não reduz resultados ao limite permitido nem presume um ponto ausente.

## Tecnologias e estrutura

| Componente | Papel |
| --- | --- |
| JavaScript e Chrome Manifest V3 | Extensão executada na página autorizada do SISAGUA |
| Parser e núcleo de regras | Extração, normalização, conversão e classificação |
| Chrome Storage API | Armazenamento local dos lotes |
| Node.js | Geração da base e testes de regras |
| Playwright e Chrome | Testes de interação com páginas locais simuladas |

- `chrome-extension-sisagua/`: extensão instalável, interface e testes.
- `referencias/`: base versionada, metadados e fontes de consulta.
- `tools/generate-legal-data.mjs`: geração dos dados consumidos pela extensão.
- `PROTOCOLO_MENSAL.md` e `PROTOCOLO_SEMESTRAL.md`: documentação dos fluxos.

## Instalação

1. Baixar ou clonar o repositório.
2. Abrir `chrome://extensions` no Chrome e ativar o modo do desenvolvedor.
3. Selecionar **Carregar sem compactação** e escolher `chrome-extension-sisagua`.
4. Após uma atualização, recarregar a extensão e depois a página do SISAGUA.

O manifesto limita a execução a `https://sisagua.saude.gov.br/sisagua/*` e solicita a permissão de armazenamento. Não são fornecidas credenciais do serviço.

## Demonstração e testes

Exemplo sintético e verificação do núcleo, sem preencher o serviço real:

```sh
node chrome-extension-sisagua/demo.mjs
node chrome-extension-sisagua/tests/core-validation.mjs
node chrome-extension-sisagua/tests/parser-full-lot.mjs
```

Geração da base e suíte completa:

```sh
npm run generate:legal
npm run check
npm test
```

Os testes de interação usam Playwright e Chrome. Os caminhos podem ser informados por `SISAGUA_PLAYWRIGHT_PATH` e `SISAGUA_CHROME_PATH`; a suíte atual foi escrita para o ambiente Windows do projeto. Consulte os arquivos de teste antes de executar em outro ambiente.

Na preparação desta distribuição, passaram as verificações iniciais de base legal, núcleo, parsers, contrato de cabeçalhos e manifesto. O cenário de lote completo conferiu **92 resultados**. A suíte integral de navegador não foi concluída porque o download de uma evidência de teste foi cancelado pelo ambiente.

## Dados e limites

Os lotes embarcados estão vazios e os exemplos de testes não incluem cadastros operacionais. Não acompanham o repositório laudos, credenciais, arquivos de execução ou dados extraídos do armazenamento do navegador.

A base legal é uma referência versionada do projeto. Sua adequação e atualização devem ser verificadas antes de uso regulatório. Este portfólio não demonstra um protocolo ou envio real ao SISAGUA.

Veja as [instruções detalhadas da extensão](chrome-extension-sisagua/README.md).
