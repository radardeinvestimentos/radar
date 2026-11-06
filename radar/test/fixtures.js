// Fixtures com datas dinâmicas (sempre "de hoje") e manchetes reais de 14/10/2026 observadas nos portais.
const rfc = (minAgo) => new Date(Date.now() - minAgo * 60e3).toUTCString().replace('GMT', '+0000');
const isoNoTz = (minAgo) => new Date(Date.now() - minAgo * 60e3 - 3 * 3600e3).toISOString().slice(0, 19); // horário de Brasília sem fuso

export const infomoney = () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<title>InfoMoney</title><link>https://www.infomoney.com.br</link><description>x</description>
<item><title><![CDATA[Possível alta de juros pelo Fed não deve pesar na renda variável no curto prazo, diz chefe de investimentos do ASA]]></title>
<link>https://www.infomoney.com.br/mercados/fed-juros-renda-variavel/</link><pubDate>${rfc(30)}</pubDate>
<category><![CDATA[Mercados]]></category><category><![CDATA[Federal Reserve]]></category><category><![CDATA[Juros]]></category>
<description><![CDATA[<p>Para o executivo, o ciclo de alta de juros nos EUA &#8211; se vier &#8211; já está parcialmente precificado.</p>]]></description></item>
<item><title>Ibovespa volta do feriado de mau humor, cai mais de 1% e vê MGLU3 e LREN3 derreterem</title>
<link>https://www.infomoney.com.br/mercados/ibovespa-fecha/</link><pubDate>${rfc(95)}</pubDate>
<category>Mercado</category><category>Ibovespa fechamento</category><description>Bolsa fecha em queda com varejo pressionado.</description></item>
<item><title>IFIX recua 0,94% e fecha pregão da terça-feira aos 3.951 pontos</title>
<link>https://www.infomoney.com.br/fiis/ifix-fecha/</link><pubDate>${rfc(120)}</pubDate>
<category>FIIs</category><category>IFIX</category><description>Fundos imobiliários em queda.</description></item>
<item><title>FMI pede ajuste fiscal e alerta que mercados podem forçar governos a agir</title>
<link>https://www.infomoney.com.br/economia/fmi-fiscal/</link><pubDate>${rfc(200)}</pubDate>
<category>Economia</category><description>Relatório do Fundo cobra consolidação das contas públicas.</description></item>
<item><title>Mega-Sena acumulada: veja quanto rende o prêmio de R$ 150 milhões</title>
<link>https://www.infomoney.com.br/loteria/mega-sena/</link><pubDate>${rfc(220)}</pubDate>
<category>Loterias</category><category>Taxa Selic</category><description>Prêmio acumulado.</description></item>
<item><title>Papa Leão XIV nomeia e transfere bispo no Brasil; saiba quem é</title>
<link>https://www.infomoney.com.br/brasil/papa/</link><pubDate>${rfc(240)}</pubDate><category>Brasil</category><description>Nomeação.</description></item>
</channel></rss>`;

export const moneytimes = () => `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Money Times</title>
<item><title>Petróleo: AIE vê retomada de oferta vulnerável com guerra no Irã</title>
<link>https://www.moneytimes.com.br/petroleo-aie/</link><pubDate>${rfc(45)}</pubDate><category>Commodities</category><description>Agência alerta.</description></item>
<item><title>Possível alta de juros pelo Fed não deve pesar na renda variável no curto prazo, diz chefe do ASA</title>
<link>https://www.moneytimes.com.br/fed-asa/</link><pubDate>${rfc(35)}</pubDate><category>Mercados</category><description>Entrevista.</description></item>
<item><title>Copom deve manter Selic e sinalizar cautela, dizem economistas</title>
<link>https://www.moneytimes.com.br/copom-selic/</link><pubDate>${rfc(60)}</pubDate><category>Juros</category><description>Projeções.</description></item>
</channel></rss>
<!-- truncado de propósito: sem fechamento do último item abaixo --><item><title>Item quebrado</title><link>https://x`;

export const exame = () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item><title>Flávio Bolsonaro critica Pix para MEI anunciado por Lula: 'Ele acha que o povo é otário'</title>
<link>https://exame.com/brasil/pix-mei/</link><pubDate>${isoNoTz(50)}</pubDate><category>Brasil</category><description>Campanha eleitoral.</description></item>
<item><title>Lula confirma presença em debate da Band</title>
<link>https://exame.com/brasil/debate-band/</link><pubDate>${isoNoTz(80)}</pubDate><category>Brasil</category><description>Segundo turno.</description></item>
</channel></rss>`;

export const atom = () => `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title>Dólar fecha em queda com exterior favorável</title>
<link rel="alternate" href="https://exemplo.com/dolar-cai"/><link rel="self" href="https://exemplo.com/self"/>
<updated>${new Date(Date.now() - 20 * 60e3).toISOString()}</updated><category term="Câmbio"/><summary>Moeda americana recua.</summary></entry>
</feed>`;

export const gnews = () => `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Google News</title>
<item><title>Governo anuncia novo limite para gastos e mira superávit em 2027 - Valor Econômico</title>
<link>https://news.google.com/rss/articles/CBMiabc</link><pubDate>${rfc(25)}</pubDate>
<description>&lt;a href="https://news.google.com/x"&gt;Governo anuncia novo limite&lt;/a&gt;</description></item>
</channel></rss>`;

export const cnnHtml = () => `<html><body>
<a href="/economia/money/macroeconomia/fmi-pede-ajuste-fiscal-e-alerta-que-mercados-podem-forcar-governos-a-agir/"><h3>FMI pede ajuste fiscal e alerta que mercados podem forçar governos a agir</h3></a>
<a href="/economia/">Economia</a>
<a href="/economia/money/negocios/cedro-obtem-aval-ambiental-para-terminal-de-minerio-de-ferro-em-itaguai/">Cedro obtém aval ambiental para terminal de minério de ferro em Itaguaí</a>
<a href="/esportes/futebol/jogo-de-ontem-terminou-empatado-em-casa/">Jogo de ontem terminou empatado em casa pelo campeonato</a>
</body></html>`;
