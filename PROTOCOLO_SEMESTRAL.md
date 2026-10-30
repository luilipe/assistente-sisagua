# Protocolo operacional — Controle semestral de SAC no Sisagua

## Objetivo e limite de ação

Usar com `AGENTS.md` para lote semestral. Não misturar com o mensal, mesmo quando o laudo contém parâmetros usados nos dois formulários. Preparar a revisão, mas nunca efetuar o envio definitivo sem autorização explícita.

## Entradas do lote

- relatório semestral anterior ou visualização já preenchida;
- todos os laudos do semestre;
- semestre e ano;
- Sisagua aberto e autenticado na SAC correta;
- pontos de captação, saída do tratamento e consumo confirmados;
- alterações cadastrais confirmadas;
- metadado local com `status=USO_LOCAL_ROTINEIRO`.

Registrar semestre, ano, SAC e `base_id` uma vez no lote.

## Preparação e registro temporário

Processar todos os PDFs antes de abrir a primeira categoria. Extrair uma única vez para um arquivo temporário estruturado, mantendo por linha:

```text
base_id | arquivo | amostra | ponto | categoria | parametro_original
data_coleta | data_analise | resultado_original | valor_numerico | unidade
tipo_limite | avaliacao | decisao_lancamento | status_sisagua
```

O arquivo temporário evita reabrir os laudos a cada parâmetro, mas não substitui o documento de origem. Atualizar `status_sisagua` após cada validação/salvamento e remover o arquivo somente depois da visualização final, das pendências e da confirmação de encerramento do lote.

## Blocos e classificação

O formulário possui:

1. `Monitoramento da qualidade da água no ponto de captação`;
2. `Monitoramento da qualidade da água da SAC`, com saída do tratamento e/ou consumo.

Classificar pelo conteúdo do laudo, nunca pelo nome do arquivo:

- poço, água subterrânea ou captação -> `CAPTACAO_POCO`;
- saída do tratamento -> `SAIDA_TRATAMENTO`;
- torneira/refeitório/consumo -> `CONSUMO`;
- insuficiente ou contraditório -> `INDEFINIDO` e perguntar.

Não deslocar resultados entre pontos para preencher campos vazios.

Na SAC observada, o cadastro apresentou quatro pontos de captação, enquanto o monitoramento da qualidade da água utilizou os três últimos pontos indicados pelo usuário. Tratar isso como configuração desta SAC, não como regra geral. Registrar rótulo, tipo e coordenadas do ponto quando visíveis; nunca selecionar apenas por posição ordinal sem reconfirmar a identidade.

## Registro canônico

Criar uma linha por `amostra + parametro`, usando os campos do protocolo mensal e acrescentando:

```text
grupo_sisagua | bloco_relatorio | coluna_ponto | data_analise
ld_original | lq_original | vmp_laboratorio | limite_legal
resultado_convertido | fonte_id | avaliacao_legal | decisao_lancamento
```

Guardar resultado original e convertido separadamente. Buscar somente o parâmetro/alias necessário no CSV local. Se o VMP do laboratório divergir da base, guardar ambos e avisar antes do lançamento.

## Mapeamento operacional conhecido

### Captação

Quando realizados e existentes na tela: inorgânicos, orgânicos, agrotóxicos/metabólitos e `Outros` como condutividade, cor verdadeira, fósforo total, nitrogênio amoniacal, pH e turbidez.

Mapeamentos de tela confirmados pelo usuário para laudos deste formato:

- `Nitrato` do laudo -> `Nitrato (como N)` em Inorgânicos;
- `Nitrito` do laudo -> `Nitrito (como N)` em Inorgânicos;
- `Fósforo Total` -> `Outros`;
- `Nitrogênio Amoniacal` -> `Nitrogênio Amoniacal Total` em `Outros`;
- `Clordano trans` -> `Clordano`, somente para este formato de laudo e conforme confirmação expressa do usuário;
- normalizar `Total`/`Totais` apenas como flexão do mesmo nome, nunca para aproximar substâncias diferentes.

Preservar o nome e o resultado originais no registro canônico. Para laudos de outro laboratório ou formato que não deixem segura a identidade `como N`, suspender somente o item e confirmar antes do lançamento.

DBO, DQO e oxigênio dissolvido permanecem `Não Informado` quando ausentes do laudo.

### Saída do tratamento

Produtos secundários da desinfecção e organolépticos analisados nesse ponto.

O lote atual usa saída do tratamento para Produtos Secundários e Organolépticos. A interface de Produtos Secundários também possui posições de consumo; em outro lote, escolher o grupo exclusivamente pela classificação do laudo, não pela configuração atual da extensão.

Na tela semestral, Produtos Secundários de Desinfecção exige primeiro `Número de amostras analisadas`. Usar `1` quando houver uma análise e somente então preencher coleta, análise e resultado. A tela dispõe três posições de amostra para saída do tratamento e três para consumo; escolher o grupo pelo ponto do laudo. Radioatividade e Organolépticos possuem uma posição de saída e uma de consumo, sem esse seletor.

Mapeamento técnico observado na interface:

- Produtos Secundários: saída `loopPA 0..2`, consumo `loopPA 3..5`;
- Radioatividade e Organolépticos: saída `loopPA 0`, consumo `loopPA 1`.

Não usar automaticamente o primeiro campo visível: selecionar sempre a posição correspondente ao ponto classificado no laudo.

Aliases confirmados para este formato de laudo na saída do tratamento:

- `Trihalometanos Totais` do laudo -> `Trihalometanos Total` no Sisagua;
- `Nitrogênio Amoniacal` -> `Amônia (como N)` em Organolépticos;
- `Sulfeto (H2S não dissociado)` -> `Sulfeto de hidrogênio`;
- `Dureza total` mantém identidade direta.

Classificar o ponto antes de aplicar alias. `Nitrogênio Amoniacal` de captação corresponde a `Nitrogênio Amoniacal Total` em `Outros`; o mesmo nome em amostra de saída pode corresponder a `Amônia (como N)` em Organolépticos. Preservar o nome original no registro canônico.

Em Produtos Secundários de Desinfecção, definir `Número de amostras analisadas = 1` antes de procurar datas e valor. Após a atualização Ajax, localizar novamente o conteúdo do parâmetro e usar a primeira posição do grupo correspondente ao ponto classificado.

### Consumo

Parâmetros identificados como torneira ou consumo. Radioatividade alfa/beta pertence aqui quando o laudo assim indicar.

Não transferir pH, condutividade, cloro ou turbidez do mensal para o semestral se a seção não os solicitar. Parâmetro ausente da tela não deve ser forçado para campo semelhante.

Radioatividade usa `NIVEL_TRIAGEM`, não VMP simples. A automação deve abrir revisão prévia guiada com ponto, datas, resultado, unidade e nível de triagem. Depois de confirmação explícita, pode preencher, validar e salvar normalmente; não deixar a categoria em um bloqueio sem ação disponível.

## Datas, sinais e unidades

- Usar `data_coleta` do laudo e `data_analise` específica do parâmetro.
- Não substituir por recebimento, emissão ou publicação.
- Coleta dentro do semestre com análise posterior só é usada se aceita pelo Sisagua; em dúvida, perguntar.
- Preservar `<` e `>` no registro e na avaliação legal.
- Converter `µg/L -> mg/L` dividindo por 1.000; `mg/L -> µg/L` multiplicando por 1.000.
- Exemplo de controle: `<0,01 µg/L` de 2,4,6-triclorofenol = `<0,00001 mg/L`, não `0,01 mg/L`.
- LD e LQ só entram se houver campos correspondentes e a regra da interface estiver confirmada.
- Neste formulário e neste fluxo, preencher por padrão somente `Data da coleta`, `Data da análise` e `Valor quantificado`. Em Produtos Secundários, preencher antes o número de amostras.
- Quando o laudo traz `<` ou `>`, preservar o sinal em `resultado_original` e usar no campo quantificado somente o componente numérico definido para o lançamento. Não selecionar `<LD` ou `<LQ` nem preencher LD/LQ por aproximação.
- Nunca trocar um resultado pelo VMP para fazê-lo caber na regra. Resultado acima do limite ou unidade inconclusiva exige aviso e confirmação antes do lançamento.

## Avaliação legal

Aplicar as regras e alertas de `AGENTS.md` usando `tipo_limite` do CSV. Não tratar fórmula, percentual, triagem, gatilho ou informativo como VMP simples.

Avisar com: arquivo, amostra, ponto, parâmetro, resultado original, convertido, limite/regra, unidade, `fonte_id` e conclusão. Bloquear somente o item afetado quando unidade ou identidade não forem seguras.

## Ordem eficiente de preenchimento

1. Inventariar, extrair e classificar todos os laudos.
2. Normalizar nomes, unidades, datas e sinais.
3. Comparar com a base local e resolver alertas.
4. Separar `CAPTACAO_POCO`, `SAIDA_TRATAMENTO` e `CONSUMO`.
5. Ordenar como a tela: inorgânicos, orgânicos, agrotóxicos, outros, produtos secundários, radioatividade e organolépticos.
6. Congelar os dados do lote em arquivo temporário e só então iniciar a automação.
7. Preencher um grupo/ponto por vez; em categorias grandes, salvar em blocos internos e reabrir antes de continuar.
8. Processar todos os itens seguros; acumular conflitos e apresentar uma revisão consolidada ao fim da categoria.
9. Validar cada parâmetro, salvar a janela e reabri-la.
10. Confirmar mensagem de sucesso e `Status: S` de cada item esperado.
11. Auditar todos os cabeçalhos visíveis; todo `Status: N` deve estar mapeado ou listado como pendência.
12. Gerar visualização e cruzar com o registro canônico.

Nos campos antigos do Sisagua, digitar simulando teclado, usar `Enter` se necessário, retirar o foco e conferir; em seletor personalizado, clicar na opção visível. Não recarregar a página com dados não salvos.

## Automação e diagnóstico

- Uma atualização de código só entra em vigor depois de recarregar a extensão em `chrome://extensions` e atualizar a página do Sisagua. Conferir horário das novas linhas do log; log antigo significa script antigo.
- Antes de iniciar, selecionar no painel a mesma categoria da janela aberta. Confirmar a categoria pelos parâmetros visíveis e o ponto depois que o primeiro acordeão carregar.
- Se o log parar em `abrindo...` e expirar, comparar o nome configurado com o cabeçalho real. Diferenças confirmadas como `Total`/`Totais` podem usar alias explícito; não repetir tentativas sem corrigir a identidade.
- Produtos Secundários exige número de amostras antes dos demais campos. Se os campos não aparecerem, reler o DOM depois da atualização Ajax.
- Categorias grandes podem perder dados quando salvas de uma vez. Salvar em blocos, aguardar o modal fechar, reabrir e auditar os itens do bloco antes de continuar.
- A revisão posterior deve preencher somente itens com valor confirmado. Pendências sem dados ficam informativas, sem caixa de seleção acionável.
- O painel pode ser minimizado; ao concluir, deve emitir som e indicar verde para categoria completa ou laranja para pendências.
- A automação nunca aciona o envio definitivo.

## Revisão final

- [ ] semestre, ano, SAC e pontos corretos;
- [ ] todos os laudos inventariados e classificados pelo documento;
- [ ] captação, saída e consumo não confundidos;
- [ ] datas, unidades, LD/LQ e conversões conferidos;
- [ ] todos os resultados avaliados pela base local;
- [ ] ultrapassagens, mínimos, qualitativos e inconclusões avisados;
- [ ] parâmetros ausentes não inventados nem forçados;
- [ ] cada janela mostra sucesso e status concluído;
- [ ] todos os cabeçalhos `Status: N` foram mapeados ou listados nominalmente como pendência;
- [ ] a versão correta da extensão e novos horários de log foram confirmados;
- [ ] visualização confere com o registro canônico;
- [ ] arquivo temporário removido somente após a auditoria final;
- [ ] envio definitivo aguarda autorização explícita.
