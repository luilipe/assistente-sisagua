# Fontes legais — qualidade da água para consumo humano

## Base local de rotina

Base conferida em 13/07/2026 a partir do texto oficial fornecido pelo usuário e identificada como `PRT888_LOCAL_2026-07-13_v2`.

- Limites para consulta rápida: `limites_legais_sisagua.csv`.
- Planilha para leitura humana: `../outputs/legal/limites_legais_sisagua.xlsx`.
- Metadados e controle de versão: `limites_legais_sisagua.meta`.
- Texto integral offline para auditoria: `portaria_gm_ms_888_2021_texto_oficial.txt`.

Na rotina mensal ou semestral, pesquisar somente a linha do parâmetro no CSV. Não abrir o texto integral e não acessar a internet a cada lote.

## Norma de referência

A página oficial do Ministério da Saúde informa que a norma vigente é o **Anexo XX da Portaria de Consolidação GM/MS nº 5, de 28 de setembro de 2017**, atualizado por:

- **Portaria GM/MS nº 888, de 4 de maio de 2021** — padrão de potabilidade e procedimentos de controle e vigilância;
- **Portaria GM/MS nº 2.472, de 28 de setembro de 2021** — alteração do art. 44 e do Anexo 13, relacionada principalmente ao plano mínimo de amostragem.

## Links oficiais

- Vigiágua — norma vigente: https://www.gov.br/saude/pt-br/composicao/svsa/saude-ambiental/vigiagua/norma-de-qualidade/norma-de-qualidade
- Vigiágua — legislação: https://www.gov.br/saude/pt-br/composicao/svsa/saude-ambiental/vigiagua/legislacao
- Portaria GM/MS nº 888/2021, texto oficial republicado: https://bvsms.saude.gov.br/bvs/saudelegis/gm/2021/prt0888_24_05_2021_rep.html
- Portaria GM/MS nº 2.472/2021: https://bvsms.saude.gov.br/bvs/saudelegis/gm/2021/prt2472_30_09_2021.html
- Portaria GM/MS nº 888/2021 no Diário Oficial da União: https://www.in.gov.br/en/web/dou/-/portaria-gm/ms-n-888-de-4-de-maio-de-2021-318461562

## Uso da base

O arquivo `limites_legais_sisagua.csv` foi estruturado para comparação automática dos laudos. Valores marcados como `VMP` são limites máximos; `MINIMO` é limite mínimo; `FAIXA` possui mínimo e máximo; `AUSENCIA` é critério qualitativo; `FORMULA`, `REGRA_PERCENTUAL` e `NIVEL_TRIAGEM` exigem a regra indicada; `GATILHO` exige aviso e avaliação; `INFORMATIVO` não possui comparação legal numérica simples.

Não repetir URLs nem datas em cada resultado. Usar `base_id` uma vez por lote e o `fonte_id` da linha do CSV em cada parâmetro.

Revisar a base e consultar a fonte oficial somente quando: faltar parâmetro; houver conflito de identidade, unidade ou fonte; o status do metadado não for `USO_LOCAL_ROTINEIRO`; houver notícia concreta de mudança normativa; ou o usuário pedir atualização. Uma mudança normativa suspende somente as comparações afetadas até a revisão da base.
