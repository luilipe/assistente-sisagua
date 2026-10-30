# Protocolo operacional — Controle mensal de SAC no Sisagua

## Objetivo e limite de ação

Preencher o Controle SAC mensal usando o relatório anterior apenas como referência cadastral e os laudos da nova competência como fonte dos resultados. Preparar a revisão, mas nunca efetuar o envio definitivo sem confirmação explícita do usuário.

## Entradas do lote

Obter em uma única solicitação:

- relatório do Sisagua do mês anterior;
- todos os laudos do mês a cadastrar;
- Sisagua aberto e autenticado na SAC correta;
- município, mês e ano;
- confirmação de falta de água;
- confirmação de reclamações de cor, gosto ou odor;
- confirmação de alterações cadastrais ou nos pontos.

Registrar `competencia=AAAA-MM`, SAC e `base_id` do metadado.

## Reaproveitamento

Copiar somente se o usuário confirmar que não mudou: Cadastro Estadual de Vigilância Sanitária, responsável, cargo, SAC e pontos cadastrados.

Nunca copiar do mês anterior: resultados, datas, amostras, quantidades, faixas, presença/ausência, falta de água ou reclamações.

## Processamento dos laudos

1. Inventariar todos os arquivos e páginas; detectar ilegíveis, incompletos e duplicados.
2. Extrair todos os laudos antes de abrir parâmetros no Sisagua.
3. Criar uma linha por `amostra + parametro` com:

```text
arquivo_origem | pagina | numero_amostra | identificacao_ponto | tipo_ponto
data_coleta | parametro_laudo | parametro_sisagua | resultado_original
resultado_lancamento | unidade_original | unidade_comparacao | interpretacao
limite_legal | fonte_id | avaliacao_legal | observacao | status
```

4. Preservar zeros, hífens, `<`, `>`, unidade e nome original do parâmetro.
5. Classificar o ponto somente pelo texto do laudo:
   - saída do tratamento -> `SAIDA_TRATAMENTO`;
   - torneira/ponto de consumo -> `CONSUMO`;
   - poço/captação -> `CAPTACAO_POCO`;
   - insuficiente/contraditório -> `INDEFINIDO` e perguntar.
6. Usar data da coleta, nunca emissão, recebimento ou análise como substituta.

Não usar o nome do arquivo para deduzir ponto. Não confundir bactérias heterotróficas com esporos de bactérias aeróbias nem mapear parâmetros apenas por semelhança.

## Normalização e limite legal

- Buscar somente cada parâmetro/alias no CSV local, conforme `AGENTS.md`.
- Converter unidades antes de comparar; guardar original e convertido.
- Resultado qualitativo só vira presença/ausência quando a equivalência for inequívoca.
- Preservar `<L` ou `>L`. Se o Sisagua aceitar apenas número, usar a forma aceita pelo campo e registrar a interpretação; nunca tratar `L` como resultado medido.
- Parâmetro não realizado fica vazio; nunca usar zero, ausência ou dado herdado.
- Amostra repetida para parâmetros diferentes gera linhas diferentes; repetição da mesma amostra e mesmo parâmetro exige verificação de duplicidade.
- Aplicar o estado legal comum definido em `AGENTS.md` e avisar o usuário antes de lançar qualquer alerta.

## Consolidação

Agrupar por `parametro_sisagua + tipo_ponto + data_coleta`, conforme a tela. Para cada grupo guardar amostras usadas, unidade, total, presença, ausência, faixas, conversões e pendências.

Validações obrigatórias:

```text
presenca + ausencia = total_analisado
soma_das_faixas = total_analisado
data_coleta pertence à competencia
cada valor possui arquivo_origem
status PENDENTE não é lançado
```

## Preenchimento no Sisagua

1. Confirmar visualmente SAC, município, mês e ano.
2. Preencher identificação estável já confirmada e clicar em **Validar**.
3. Abrir um parâmetro por vez e confirmar o ponto exibido.
4. Preencher somente o grupo consolidado daquele parâmetro/ponto.
5. Em campo numérico, digitar simulando teclado; usar `Enter` se necessário, retirar o foco e conferir o valor.
6. Em seletor personalizado, clicar na opção visível.
7. Validar e salvar a janela individualmente.
8. Confirmar **“Registro alterado com sucesso”** e o indicador de status da linha.
9. Se uma confirmação falhar, reabrir e corrigir antes de avançar.

Não recarregar, voltar ou sair com dados não salvos. Se a sessão expirar, parar e pedir nova autenticação.

## Revisão e entrega

Antes da visualização, confirmar:

- [ ] SAC, município, competência e pontos corretos;
- [ ] datas da competência e unidades/separadores conferidos;
- [ ] totais coerentes com presença/ausência ou faixas;
- [ ] todos os realizados com status concluído;
- [ ] não realizados continuam vazios;
- [ ] falta de água e reclamações confirmadas pelo usuário;
- [ ] origem, `fonte_id`, limite e avaliação rastreáveis;
- [ ] todos os alertas foram apresentados ao usuário.

Abrir a visualização, cruzar com a consolidação e apresentar:

```text
Competência | SAC/Município | laudos | amostras únicas
parâmetros validados | não realizados | alertas | pendências
falta de água | reclamações | status=AGUARDANDO_AUTORIZACAO_FINAL
```

Não clicar em enviar/finalizar até autorização explícita para esse ato.

## Perguntas ao usuário

Perguntar somente quando a decisão não for segura: ponto/resultado ilegível, parâmetro sem correspondência, unidade incompatível, data fora do período, duplicidade suspeita, `<`/`>` incompatível com o campo, totais divergentes, dado operacional ausente ou tela em SAC/competência diferente. Agrupar perguntas e citar arquivo, amostra, parâmetro e decisão necessária.
