# Assistente SISAGUA SAC — v2.0.4

Extensão local para importar laudos e preencher categorias do controle **SEMESTRAL** de SAC. Ela valida, salva e audita cada categoria, mas nunca aciona o envio definitivo do formulário.

## Instalação e atualização

1. Se houver alterações abertas no Sisagua, salve-as antes de atualizar a extensão.
2. Abra `chrome://extensions`, ative **Modo do desenvolvedor** e use **Carregar sem compactação**.
3. Selecione a pasta `chrome-extension-sisagua` deste projeto.
4. Em atualizações, clique no ícone de recarga do cartão da extensão.
5. Volte ao Sisagua, use `Ctrl+R` e reabra a categoria no bloco correto.

É necessário recarregar tanto a extensão quanto a página. Uma página já aberta continua executando a versão antiga do script até ser atualizada.

A primeira linha do log informa a versão carregada e a base legal. Confirme `v2.0.4` depois de recarregar a extensão e a página.

## Fluxo recomendado

1. Processe todos os laudos do lote antes de preencher o Sisagua.
2. Na aba **Importar Laudo**, cole o texto de uma única amostra e clique em **Extrair Dados**. A extensão registra automaticamente a origem como texto colado, vinculada ao número da amostra; não é necessário digitar o nome do arquivo.
3. Confira o cabeçalho, os parâmetros, as avaliações legais, os itens não mapeados e as pendências.
4. Clique em **Gerar Lotes**. Os dados são guardados no armazenamento próprio da extensão.
5. Na aba **Categorias**, selecione a categoria desejada e clique em **Revisar antes de preencher**.
6. Confirme SAC/cliente, semestre/ano, amostra, bloco, ponto, datas, resultados, unidades e regras.
7. Inicie o preenchimento. Antes de alterar campos, a extensão resolve todos os cabeçalhos da ação. Itens com `Status: S` só são reaproveitados depois de conferir ponto, datas, valor e unidade.
8. Ao terminar, use **Exportar registro** para baixar o registro canônico temporário em JSON.
9. Resolva nominalmente todas as pendências antes de considerar o lote concluído.

O importador aceita somente uma amostra/ponto/coleta por colagem. Se duas amostras diferentes destinarem resultados ao mesmo cliente, ponto e categoria, os lotes são bloqueados até consolidação e aprovação manual.

O nome do PDF era solicitado nas versões anteriores apenas para cumprir a rastreabilidade exigida pelo registro canônico. Porém, ao colar texto, o navegador não recebe o nome do arquivo que estava aberto. A versão 2.0.1 registra essa proveniência de modo explícito como **texto colado + número da amostra**, sem exigir digitação e sem inventar um nome de arquivo.

## O que é validado

- lote obrigatoriamente semestral;
- `base_id` igual à base legal local liberada;
- IDs, categorias, pontos, datas e nomes sem ambiguidades;
- origem, amostra, resultado original, unidade e fonte de cada resultado;
- correspondência de parâmetros por nome exato, alias explícito ou expansão controlada especificamente autorizada;
- preflight integral dos cabeçalhos antes da primeira alteração da ação;
- conversão documentada entre `µg/L` e `mg/L`, e equivalência `NTU`/`uT`;
- limites, faixas, mínimos, ausência e regras especiais conforme a linha correspondente da base local;
- incompatibilidade entre categoria e ponto;
- duplicidades exatas ou conflitantes;
- conflitos entre múltiplas amostras para o mesmo destino.

Resultados com `EXCEDE_VMP`, `ABAIXO_MINIMO`, `NAO_CONFORME_QUALITATIVO`, `INCONCLUSIVO_LQ`, `ATENCAO_UNIDADE`, aplicação/identidade pendente ou regra especial não são lançados silenciosamente. Eles permanecem como revisão ou pendência.

`Gosto e Odor: Ausência` pode ser normalizado para intensidade `0` porque essa transformação está expressamente registrada na base local. O texto original permanece preservado no registro.

## Salvamento e auditoria

- O lote usado pela execução é congelado; seleção, importação e exclusão ficam bloqueadas enquanto a automação está ativa.
- A parada acontece entre parâmetros. Se houver alterações locais, a extensão tenta salvar e auditar o progresso antes de encerrar.
- Categorias grandes são salvas em blocos de até 10 alterações.
- Um salvamento só é aceito quando surge uma **nova** mensagem oficial `Registro alterado com sucesso`.
- Depois de salvar, a extensão exige o fechamento da janela, reabre a linha inequívoca da categoria/bloco/ponto e audita ponto, coleta, análise, valor e `Status: S`.
- Mesmo quando todos os itens já estão `S`, a categoria é reaberta e auditada.
- Todo cabeçalho visível com `Status: N` precisa estar mapeado para o lote ou registrado nominalmente como pendência.

Se o salvamento ou a reabertura falhar, a extensão não declara sucesso. O painel informa se os itens ficaram não salvos ou se o progresso foi recuperado e auditado.

## Registro canônico

O botão **Exportar registro** gera um JSON com:

- `base_id`, origem, amostra, cliente, competência e ponto;
- resultado original, valor usado, unidade e eventual conversão;
- regra, fonte e decisão legal;
- parâmetros, revisões, itens ignorados, não mapeados e duplicidades;
- estado de salvamento, horário da auditoria e evidência da mensagem oficial.

O arquivo é temporário e não representa envio definitivo. Preserve-o até a auditoria final do lote; depois disso, a exclusão é uma decisão do usuário.

## Roteamento dos pontos

- Inorgânicos, Orgânicos, Agrotóxicos e Outros: `CAPTACAO_POCO`.
- Produtos Secundários de Desinfecção: `SAIDA_TRATAMENTO` ou `CONSUMO`, conforme o laudo.
- Organolépticos: `SAIDA_TRATAMENTO` ou `CONSUMO`, conforme o laudo.
- Radioatividade: `CONSUMO` na base legal atual, sempre com confirmação prévia por usar nível de triagem. Resultado de saída do tratamento fica pendente se a aplicação legal não contemplar esse ponto.

Ponto desconhecido é classificado como `INDEFINIDO` e bloqueado. A extensão não presume captação nem desloca resultados para outro ponto.

## Persistência e atualização da base

Os lotes importados ficam em `chrome.storage.local`, separados do armazenamento da página do Sisagua. Dados antigos não recebem um novo `base_id` silenciosamente; quando a base diverge, é necessário reimportar e reavaliar o laudo.

A base usada pela extensão é gerada a partir de:

- `referencias/limites_legais_sisagua.meta`;
- `referencias/limites_legais_sisagua.csv`.

Execute a geração e os testes antes de distribuir uma atualização:

```powershell
npm run generate:legal
npm test
```

## Diagnóstico rápido

- **Configuração inválida**: confira o log; o lote permanece bloqueado.
- **Revisão obrigatória**: confirme todo o contexto exibido no painel amarelo.
- **Divergência detectada**: ponto, data, valor ou status persistido não corresponde ao lote.
- **Mensagem oficial não apareceu**: o salvamento não foi confirmado. A extensão aguarda até 45 segundos e informa se a janela fechou e quais mensagens do Sisagua permaneceram visíveis.
- **Linha ambígua**: existem zero ou múltiplas linhas compatíveis; nenhuma é aberta automaticamente.
- **Conjuntos distintos para o ponto**: há mais de um grupo real de campos. A extensão só escolhe quando `pontoIdentificacao` corresponde exclusivamente a um deles; caso contrário, interrompe antes de preencher.
- **Rótulos equivalentes**: cabeçalhos ou rótulos repetidos que levam ao mesmo conjunto de campos são deduplicados e registrados no log.
- **Mais de uma amostra para o mesmo destino**: consolidação manual necessária.
- **Copiar log**: copia o histórico da execução.
- **Exportar registro**: baixa o registro canônico temporário.

## Limite de segurança

A extensão pode clicar em **VALIDAR** e **SALVAR** dentro de uma categoria. Não existe código para clicar em **ENVIAR**, **FINALIZAR**, **CONCLUIR** ou ação equivalente do formulário semestral.
