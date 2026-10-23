# Radar do Assessor

Agregador **100% gratuito** de notícias financeiras (Brasil + internacionais), separado por tópicos, com uma aba final de **impacto para o assessor de investimentos**. Funciona como site (abre em qualquer dispositivo) e como **API JSON**.

## Como funciona (custo: R$ 0)

```
GitHub Actions (a cada ~15 min)  →  lê os feeds  →  classifica por tópico  →  analisa impacto
        →  publica JSON + site no GitHub Pages  →  você acessa de qualquer aparelho
```

- **Hospedagem e agendador:** GitHub Pages + GitHub Actions (grátis em repositório público).
- **Sem banco de dados:** o histórico das últimas 72 h é lido do próprio site publicado a cada coleta.
- **Análise de impacto:** motor de regras próprio (grátis, sem chave). Opcionalmente, IA do Google Gemini (camada gratuita).
- **Só manchete, resumo curto e link** para a matéria original (respeita direitos autorais e paywalls).

## Publicar (≈ 10 minutos)

1. Crie uma conta em github.com (se não tiver) e um **repositório público** novo, por exemplo `radar`.
2. Envie todo o conteúdo desta pasta para o repositório (botão *Add file → Upload files*; inclua a pasta oculta `.github`).
3. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Vá em **Actions → "Atualizar notícias" → Run workflow**. Em ~1 minuto o site estará no ar em
   `https://SEU-USUARIO.github.io/radar/`.
5. Abra o site, role até o rodapé e veja **"Saúde das fontes"**: mostra quais portais responderam e quais não.

A partir daí a coleta roda sozinha (a cada ~15 min das 6h às 23h de Brasília; de hora em hora na madrugada).

## Atualização

- **Automática:** o servidor coleta sozinho; a página confere novidades a cada 5 min e quando você volta para a aba.
- **Botão "Atualizar":** recarrega os dados mais recentes publicados. Para forçar uma coleta **agora**, use o link no rodapé (abre *Run workflow* no GitHub).
- O cron do GitHub é "melhor esforço": pode atrasar alguns minutos em horários de pico.
- Repositórios públicos **sem nenhuma atividade por 60 dias** têm o agendamento pausado pelo GitHub. Se acontecer, é só abrir *Actions* e reativar (ou fazer qualquer commit).

## Tópicos

**Seções do site:** Notícias · Prospecção · Ativos · Agenda · Leituras · Conteúdo · **★ Impacto para o assessor** (sempre a última).

Tópicos dentro de Notícias: Destaques · Economia & Atividade · Política Monetária & Juros · Fiscal & Tributário · Geopolítica & Comércio · Política & Eleições · Bolsa & Ações · Câmbio & Commodities · Fundos, FIIs & Renda Fixa · Empresas & Resultados · Regulação & Setor Financeiro · Outros

Uma notícia pode aparecer em mais de um tópico. A mesma matéria publicada por vários portais é agrupada (mostra "Também em: …").

## Aba "Impacto para o assessor"

Para cada notícia relevante: prioridade (alta/média/baixa), efeito provável por classe de ativo (▲ ▼ ◆), impacto nas carteiras dos clientes e **como gerar valor** (ideias de contato e ação). A prioridade sobe com a importância do tema, o número de portais que cobrem e a recência.

Limites: a leitura é por palavras-chave no título/resumo; o campo "Tom detectado" mostra em que ela se baseou. **É gatilho para pensar, não recomendação de investimento.** Confira sempre a matéria.

### IA opcional (Gemini, camada gratuita)

1. Gere uma chave em aistudio.google.com.
2. No repositório: **Settings → Secrets and variables → Actions → New repository secret** → nome `GEMINI_API_KEY`.
3. Pronto: as ~12 notícias de maior prioridade por coleta ganham um bloco "Análise com IA". Cada notícia é analisada uma vez. Se a cota acabar ou a chave faltar, o site continua com as regras.

## Seções novas

| Seção | O que mostra | De onde vem |
|---|---|---|
| **Prospecção** | Gatilhos nas notícias (venda de empresa, PDV, estresse de crédito, tributação, juros, eleição...) e oportunidades de calendário (PGBL, 13º, balanços...), cada um com *para quem*, *gancho da conversa* e *cuidado de compliance*. Campo "Meu nicho" salvo no aparelho. | `src/triggers.js` (regras editáveis) |
| **Ativos** | Notícias por papel: IBrX 50, IBrX 100 ou **Minha lista** (tickers que você digita; fica só no seu aparelho, com código para copiar/importar em outro aparelho). | `public/data/ativos.json` + `public/match.js` |
| **Agenda** | Copom, Fed, IPCA, PIB, Focus, balanços etc., agrupados em hoje / esta semana / semana que vem / mais adiante, com *o que esperar*, *antes* e *depois*. Data confirmada x estimada. | `config/agenda.json` |
| **Leituras** | Tabela do Boletim Focus (BCB, com variação semanal), roteiro "O que muda para o meu cliente?", documentos (ata do Copom, relatório do BC) e gestoras para acompanhar. | API do BCB + `config/leituras.json` |
| **Conteúdo** | Plano da semana, pauta por tema, rascunho de newsletter (botão copiar) e checklist de compliance. Guarda 8 dias de notícias. | `src/content.js` |

### Como editar sem mexer em código

- **Datas e eventos:** `config/agenda.json` (cada evento tem `data`, `tipo`, `confianca`: `confirmado` ou `estimado`). Revise quando o BCB, o Fed e o IBGE publicarem novos calendários.
- **Documentos e gestoras:** `config/leituras.json`. Para registrar um resumo, troque `"status": "pendente"` por `"pronto"` e preencha `resumo` e `muda` ("o que muda para o meu cliente").
- **Papéis:** `public/data/ativos.json` (`t` ticker, `n` nome, `a` apelidos, `i` 50 ou 100 = índice). A B3 revisa o IBrX a cada quatro meses: atualize quando mudar. Evite apelidos que sejam palavras comuns (o teste avisa).
- **Compliance:** os textos de gatilho e de conteúdo são sugestões. Passe pelo compliance da sua assessoria.

## API

Base: `https://SEU-USUARIO.github.io/radar/api/`

| Endpoint | Conteúdo |
|---|---|
| `news.json` | tudo (últimas 72 h) com tópico e análise |
| `impact.json` | ranking de impacto (1 por matéria) |
| `topics/<id>.json` | um tópico: `economia`, `monetaria`, `fiscal`, `geopolitica`, `politica`, `mercados`, `cambio`, `fundos`, `empresas`, `regulacao`, `geral` |
| `prospeccao.json` | gatilhos e oportunidades de calendário |
| `agenda.json` | agenda de eventos |
| `focus.json` | Boletim Focus (resumo) |
| `conteudo.json` | pauta, plano e newsletter |
| `leituras.json` | documentos e gestoras |
| `sources.json` | saúde de cada portal |
| `meta.json` | data da última coleta |

CORS liberado pelo GitHub Pages; dá para consumir de planilhas, apps e automações.

## Portais

Edite `config/sources.json` para trocar URLs, desativar (`"enabled": false`) ou adicionar portais.

| Portal | Rota |
|---|---|
| InfoMoney, Seu Dinheiro, Money Times, Exame, Suno | RSS oficial (testado) |
| CNN Brasil | RSS; se falhar, lê a página de Economia |
| Valor, Reuters, FT, WSJ, Bloomberg, CNBC | RSS oficial quando existe; senão **Google News RSS** (só manchete e link) |
| A Revista | **desativado:** `arevista.com.br` redireciona para outro site; informe a URL correta |

Portais com paywall (Valor, FT, WSJ, Bloomberg) mostram só manchete e link: abrir a matéria exige assinatura sua.

## Visual

Preto e ciano, com tema escuro por padrão e botão para alternar para o claro. As cores estão **provisórias**: para usar os códigos oficiais do Grupo Ável, troque apenas as variáveis `--fill`, `--accent` e `--bg` no topo de `public/style.css`. Fontes (Sora e IBM Plex Sans) ficam em `public/fonts`, sem depender de serviço externo.

## Limites conhecidos

- O **Focus** vem da API aberta do Banco Central e **não foi testado ao vivo** (o ambiente de desenvolvimento não alcança o servidor). Na primeira coleta no GitHub, confira a aba Leituras; se falhar, o site mostra "indisponível" e o resto continua (veja `focus.json` e o campo `extras` em `news.json`).
- Datas marcadas como **estimadas** (ata do Copom, payroll, come-cotas, balanços) seguem regra geral.
- Os gatilhos são regras por palavras-chave: podem errar. Eles são ponto de partida.

## Privacidade

O site e os JSON ficam **públicos** (quem tiver o endereço acessa). Eles contêm só notícias e análises genéricas, nunca dados de clientes. Para algo privado, a alternativa gratuita é Cloudflare Pages + Cloudflare Access (login por e-mail, até 50 usuários).

## Desenvolvimento

```
npm test            # 15 testes (parser, classificação, impacto, gatilhos, agenda, Focus, conteúdo, ativos, coleta ponta a ponta)
node src/collect.js # gera public/api/ localmente (precisa de internet livre)
```

## Calculadora, mapa e Educação (23/10/2026)
- **Calculadora**: compara até 4 investimentos lado a lado, com gráfico da evolução líquida (IR regressivo, IOF dos 30 primeiros dias e custódia B3). Código: `public/calc.js` (cálculo), `public/chart.js` (gráfico), `public/app.js` (tela).
- **Mapa de ativos de renda fixa**: `public/data/mapa-rf.json` (nome completo, cupom, marcação, característica de cada classe, legenda e notas).
- **Educação**: `public/data/educacao.json`. Itens com `"confirmar": true` mostram o selo "a confirmar"; apague a linha depois de revisar.
- Testes novos: `test/pacotes.test.js`.
