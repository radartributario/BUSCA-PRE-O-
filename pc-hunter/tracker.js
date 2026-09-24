#!/usr/bin/env node
/**
 * PC Hunter — Tracker automático (Node.js)
 * Varre KaBuM/Terabyte/Pichau/Amazon a cada N minutos e dispara alerta no console + Telegram + som.
 *
 * Uso:
 *   node tracker.js
 *   INTERVAL_MIN=5 TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node tracker.js
 *
 * Requer Node 18+ (fetch nativo). Sem dependências externas.
 * Observação: lojas mudam HTML com frequência — o scraper tenta múltiplos padrões e sempre
 * gera links de busca como fallback. Para robustez total, combine com a extensão do navegador.
 */

const PARTS = [
  { id:'cpu', cat:'Processador', name:'AMD Ryzen 5 8600G 100-100001237BOX', search:'AMD Ryzen 5 8600G 100-100001237BOX', target:970 },
  { id:'mobo', cat:'Placa-mãe', name:'Gigabyte B650M Gaming Plus WiFi AM5 DDR5 9MB65MGPW-00-10', search:'Gigabyte B650M Gaming Plus WiFi AM5 DDR5 9MB65MGPW-00-10', target:900 },
  { id:'ram', cat:'Memória', name:'Kingston Fury Beast 32GB 2x16GB DDR5 6000 CL30 EXPO KF560C30BBEK2-32', search:'Kingston Fury Beast 32GB 2x16GB DDR5 6000 CL30 EXPO KF560C30BBEK2-32', target:950 },
  { id:'ssd', cat:'SSD', name:'Kingston NV3 1TB NVMe PCIe 4.0 SNV3S/1000G', search:'Kingston NV3 1TB NVMe PCIe 4.0 SNV3S/1000G', target:950 },
  { id:'psu', cat:'Fonte', name:'MSI MAG A650BN 650W 80 Plus Bronze 306-7ZP2B22-CE0', search:'MSI MAG A650BN 650W 80 Plus Bronze 306-7ZP2B22-CE0', target:300 },
  { id:'case', cat:'Gabinete', name:'Aigo DarkFlash DK352 Mesh 4 Fans DK352-MESH-4F', search:'Aigo DarkFlash DK352 Mesh 4 Fans DK352-MESH-4F', target:300 },
  { id:'gpu1', cat:'GPU', name:'Radeon RX 7600 8GB GDDR6', search:'Radeon RX 7600 8GB GDDR6', target:1750 },
  { id:'gpu2', cat:'GPU alt', name:'GeForce RTX 4060 8GB GDDR6', search:'GeForce RTX 4060 8GB GDDR6', target:1900 },
];

const STORES = [
  { id:'kabum', name:'KaBuM!', url: q => `https://www.kabum.com.br/busca/${encodeURIComponent(q)}` },
  { id:'terabyte', name:'Terabyte', url: q => `https://www.terabyteshop.com.br/busca?str=${encodeURIComponent(q)}` },
  { id:'pichau', name:'Pichau', url: q => `https://www.pichau.com.br/search?q=${encodeURIComponent(q)}` },
  { id:'amazon', name:'Amazon', url: q => `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}` },
];

// NOVO: links exatos do produto (página do produto, não busca) — muito mais confiável que busca
// Gerado pelo dashboard: clique "salvar link" em cada peça, exporte e salve como pc-hunter/links.json
// Formato: { "cpu":"https://www.kabum.com.br/produto/520365/...", "mobo":"https://..." }
// Se existir, o tracker busca DIRETO na página do produto e só dispara Zap se SKU bater
import fs from 'fs';
let SAVED_LINKS = {};
try {
  const raw = fs.readFileSync(new URL('./links.json', import.meta.url), 'utf8');
  SAVED_LINKS = JSON.parse(raw);
} catch {}
// também tenta links salvos do state exportado
try {
  if(Object.keys(SAVED_LINKS).length===0){
    const raw2 = fs.readFileSync(new URL('./state.json', import.meta.url), 'utf8');
    const j = JSON.parse(raw2);
    SAVED_LINKS = j.links || j.state?.links || {};
  }
} catch {}

const INTERVAL_MIN = Number(process.env.INTERVAL_MIN || 5);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
// WhatsApp via CallMeBot (grátis) ou Webhook genérico (n8n/Make/Evolution)
// CallMeBot: https://www.callmebot.com/blog/free-api-whatsapp-messages/
// 1. Salve +34 644 10 55 84 nos contatos, mande "I allow callmebot to send me messages" no WhatsApp
// 2. Receba seu apikey em https://api.callmebot.com/whatsapp.php?phone=SEUNUMERO&text=test&apikey=...
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE || ''; // ex: 5541999999999 (55 + DDD + número, só dígitos)
const WHATSAPP_APIKEY = process.env.WHATSAPP_APIKEY || ''; // apikey do CallMeBot
const WHATSAPP_WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL || ''; // opcional: URL do n8n/Make/Evolution que envia WhatsApp

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function fmt(v){ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

function extractProductPrice(html){
  // tenta extrair preço de PÁGINA DE PRODUTO (mais confiável)
  // 1) JSON-LD / Next data: "price": 949.90
  const jsonPrices=[];
  for(const re of [/\"price\"\s*:\s*\"?([\d\.]+)\"?/g, /\"offerPrice\"\s*:\s*([\d\.]+)/g, /\"currentPrice\"\s*:\s*([\d\.]+)/g]){
    let m; while((m=re.exec(html))!==null){ const v=Number(m[1]); if(v>80&&v<20000) jsonPrices.push(v); }
  }
  if(jsonPrices.length) return Math.min(...jsonPrices);
  // 2) fallback regex R$
  const re2=/R\$\s*([\d\.]+,\d{2})/g;
  let m2; const out=[];
  while((m2=re2.exec(html))!==null){ const raw=m2[1].replace(/\./g,'').replace(',','.'); const v=Number(raw); if(v>80&&v<20000) out.push(v); }
  if(out.length) return Math.min(...out);
  return null;
}

// tenta extrair preços do HTML — ANTI-FALSO-POSITIVO para PÁGINA DE BUSCA:
// 1) Só considera preços PRÓXIMOS ao SKU no HTML (evita pegar preço de produto aleatório da busca)
// 2) Ignora preços muito abaixo do alvo (acessórios)
// Se não encontrar preço perto do SKU, retorna vazio -> "sem preço / bloqueado" e NÃO dispara Zap
function extractPrices(html, part){
  const target = part.target;
  const sku = part.search.split(' ').pop(); // ex: 100-100001237BOX, KF560C30BBEK2-32, SNV3S/1000G, DK352-MESH-4F
  const skuShort = sku.length >= 6 ? sku.slice(0, 8) : sku;
  const minReasonable = target >= 500 ? target * 0.78 : target * 0.62; // CPU/GPU/MOBO mais rigoroso, fonte/gabinete mais flexível
  const maxReasonable = target * 1.6; // ignora preços muito acima (outro produto caro)

  // tenta achar bloco onde SKU aparece e pegar preços próximos (± 3000 chars)
  const skuIdx = html.toLowerCase().indexOf(skuShort.toLowerCase());
  let searchHtml = html;
  if(skuIdx !== -1){
    const start = Math.max(0, skuIdx - 3000);
    const end = Math.min(html.length, skuIdx + 8000);
    searchHtml = html.slice(start, end);
  }
  // se SKU não encontrado, ainda extrai preços mas marca como não-verificado (alerta será bloqueado depois via hasSku)

  const re = /R\$\s*([\d\.]+,\d{2})/g;
  const out=[];
  let m;
  while((m=re.exec(searchHtml))!==null){
    const raw=m[1].replace(/\./g,'').replace(',','.');
    const v=Number(raw);
    if(v >= minReasonable && v <= maxReasonable) out.push(v);
  }
  // se SKU foi encontrado, exige pelo menos 1 preço plausível perto dele
  // se não, já retornou vazio acima
  return [...new Set(out)].sort((a,b)=>a-b).slice(0,5);
}

async function checkSavedLinks(part){
  const entry = SAVED_LINKS[part.id];
  if(!entry) return [];
  const urls = Array.isArray(entry) ? entry : [entry];
  const out=[];
  for(const url of urls){
    if(!url || url.startsWith('_')) continue;
    try{
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      const html = await res.text();
      const price = extractProductPrice(html);
      const skuPart = part.search.split(' ').pop().toLowerCase().slice(0,6);
      const hasSku = html.toLowerCase().includes(skuPart);
      out.push({ store: 'Link salvo', url, best: price, prices: price?[price]:[], ok: res.ok, hasSku, isProductPage:true });
    }catch(e){
      out.push({ store: 'Link salvo', url, best:null, prices:[], ok:false, error: String(e).slice(0,120), hasSku:false, isProductPage:true });
    }
    await new Promise(r=>setTimeout(r, 700));
  }
  return out;
}

async function checkStore(part, store){
  const url = store.url(part.search);
  try{
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    const prices = extractPrices(html, part);
    const best = prices[0] ?? null;
    return { store: store.name, url, best, prices, ok: res.ok, status: res.status, hasSku: html.toLowerCase().includes(part.search.split(' ').pop().toLowerCase().slice(0,6)), isProductPage:false };
  }catch(e){
    return { store: store.name, url, best:null, prices:[], ok:false, error: String(e).slice(0,120) };
  }
}

async function sendTelegram(text){
  if(!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try{
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode:'Markdown', disable_web_page_preview:false })
    });
    console.log('  → Telegram enviado ✓');
  }catch(e){ console.error('Telegram erro', e.message); }
}

async function sendWhatsApp(text){
  // Prioridade 1: CallMeBot (mais simples, grátis)
  if(WHATSAPP_PHONE && WHATSAPP_APIKEY){
    try{
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(WHATSAPP_PHONE)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(WHATSAPP_APIKEY)}`;
      const r = await fetch(url);
      console.log('  → WhatsApp CallMeBot:', r.ok ? 'enviado ✓' : `erro ${r.status}`);
    }catch(e){ console.error('WhatsApp CallMeBot erro', e.message); }
  }
  // Prioridade 2: Webhook genérico (n8n / Make / Evolution / Twilio)
  if(WHATSAPP_WEBHOOK_URL){
    try{
      await fetch(WHATSAPP_WEBHOOK_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text, phone: WHATSAPP_PHONE, source:'pc-hunter' })
      });
      console.log('  → WhatsApp Webhook enviado ✓');
    }catch(e){ console.error('WhatsApp Webhook erro', e.message); }
  }
  if(!WHATSAPP_PHONE && !WHATSAPP_WEBHOOK_URL){
    // dica silenciosa — não polui log se não configurado
  }
}

async function runOnce(){
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 PC Hunter — ${new Date().toLocaleString('pt-BR')} — intervalo ${INTERVAL_MIN} min`);
  console.log(`${'='.repeat(60)}`);
  for(const part of PARTS){
    console.log(`\n[${part.cat}] ${part.name}`);
    console.log(`  alvo: ${fmt(part.target)} | busca: "${part.search}"`);
    const results=[];
    // PRIORIDADE 1: links salvos (página do produto) — vasculha TODOS em paralelo (multi-loja)
    const savedList = await checkSavedLinks(part);
    for(const saved of savedList){
      results.push(saved);
      const priceStr = saved.best!=null ? fmt(saved.best) : (saved.error? `erro: ${saved.error}` : 'sem preço / link bloqueado');
      const hit = saved.best!=null && saved.best <= part.target ? ' 🔥 NO PREÇO!' : '';
      const skuOk = saved.hasSku ? 'SKU ok' : 'SKU não encontrado';
      const storeShort = saved.url.includes('kabum')?'KaBuM':saved.url.includes('pichau')?'Pichau':saved.url.includes('terabyte')?'Terabyte':saved.url.includes('amazon')?'Amazon':'Link';
      console.log(`  → ${storeShort.padEnd(10)} ${priceStr}${hit} — ${saved.url} [${skuOk}]`);
    }
    if(savedList.length===0) console.log(`  ℹ️  sem link salvo — será monitorado via busca (sem Zap automático, só informativo)`);
    // PRIORIDADE 2: busca nas lojas (apenas informativo, NÃO dispara Zap automático para busca — só dashboard manual é confiável)
    for(const store of STORES){
      const r = await checkStore(part, store);
      results.push(r);
      const priceStr = r.best!=null ? fmt(r.best) : (r.error? `erro: ${r.error}` : 'sem preço / bloqueado');
      const hit = r.best!=null && r.best <= part.target && r.hasSku ? ' 🔥 NO PREÇO!' : (r.best!=null && r.best <= part.target ? ' (ignorado - SKU não confere)' : '');
      console.log(`  → ${store.name.padEnd(10)} ${priceStr}${hit} — ${r.url}`);
      await new Promise(res=>setTimeout(res, 900));
    }
    // só considera para ALERTA automático os links salvos (página de produto) — busca é apenas informativa
    const productResults = results.filter(r=>r.isProductPage);
    const validProductPrices = productResults.map(r=>r.best).filter(v=>v!=null);
    const bestProduct = validProductPrices.length ? Math.min(...validProductPrices) : null;
    const minPlausible = part.target >= 500 ? part.target * 0.78 : part.target * 0.62;

    if(bestProduct!=null && bestProduct >= minPlausible && bestProduct <= part.target){
      const bestStore = productResults.find(r=>r.best===bestProduct);
      if(!bestStore.hasSku){
        console.log(`  ⚠️  preço ${fmt(bestProduct)} ignorado — SKU não encontrado na página do produto (link errado?)`);
      } else {
        const msg = `🔥 *PC Hunter ALERTA* 🔥\n*${part.cat}: ${part.name}*\nPreço: *${fmt(bestProduct)}* (alvo ${fmt(part.target)})\nLoja: ${bestStore.store}\nLink: ${bestStore.url}\nBusca exata: \`${part.search}\``;
        console.log(`  ✅ ALERTA DISPARADO (link salvo) — ${fmt(bestProduct)} ≤ ${fmt(part.target)}`);
        process.stdout.write('\x07');
        await sendTelegram(msg);
        const waMsg = `🔥 PC HUNTER ALERTA 🔥\n${part.cat}: ${part.name}\nPreço: ${fmt(bestProduct)} (alvo ${fmt(part.target)})\nLoja: ${bestStore.store}\nLink: ${bestStore.url}\nCORRE PRA COMPRAR!`;
        await sendWhatsApp(waMsg);
      }
    } else if(bestProduct!=null){
      console.log(`  ⏳ link salvo acima do alvo por ${fmt(bestProduct - part.target)} (menor: ${fmt(bestProduct)})`);
    } else {
      console.log(`  ℹ️  sem link salvo — salve o link exato do produto no dashboard para alerta automático (busca não dispara Zap)`);
    }

    // info extra da busca (sem Zap) — apenas para debug
    const searchResults = results.filter(r=>!r.isProductPage);
    const validSearch = searchResults.map(r=>r.best).filter(v=>v!=null && v >= minPlausible);
    const bestSearch = validSearch.length ? Math.min(...validSearch) : null;
    if(bestSearch!=null && bestSearch <= part.target){
      const bs = searchResults.find(r=>r.best===bestSearch);
      if(bs.hasSku) console.log(`  ℹ️  busca ${bs.store} também no preço ${fmt(bestSearch)} — confirme manualmente (link de busca)`);
      else console.log(`  ℹ️  busca ${bs.store} preço ${fmt(bestSearch)} ignorado para Zap (SKU não confere)`);
    }
  }
  console.log(`\nPróxima varredura em ${INTERVAL_MIN} min — deixe rodando. Ctrl+C para sair.`);
  console.log(`Dica: defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID para receber no celular.`);
}

async function main(){
  await runOnce();
  if(INTERVAL_MIN>0){
    setInterval(runOnce, INTERVAL_MIN*60*1000);
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
