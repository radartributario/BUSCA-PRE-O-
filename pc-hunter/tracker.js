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

// tenta extrair preços do HTML (heurística — pega R$ 1.234,56)
function extractPrices(html){
  const re = /R\$\s*([\d\.]+,\d{2})/g;
  const out=[];
  let m;
  while((m=re.exec(html))!==null){
    const raw=m[1].replace(/\./g,'').replace(',','.');
    const v=Number(raw);
    if(v>50 && v<20000) out.push(v);
  }
  return [...new Set(out)].sort((a,b)=>a-b).slice(0,5);
}

async function checkStore(part, store){
  const url = store.url(part.search);
  try{
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    const prices = extractPrices(html);
    const best = prices[0] ?? null;
    return { store: store.name, url, best, prices, ok: res.ok, status: res.status };
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
    // consulta sequencial para não tomar block
    for(const store of STORES){
      const r = await checkStore(part, store);
      results.push(r);
      const priceStr = r.best!=null ? fmt(r.best) : (r.error? `erro: ${r.error}` : 'sem preço / bloqueado');
      const hit = r.best!=null && r.best <= part.target ? ' 🔥 NO PREÇO!' : '';
      console.log(`  → ${store.name.padEnd(10)} ${priceStr}${hit} — ${r.url}`);
      await new Promise(res=>setTimeout(res, 900));
    }
    const validPrices = results.map(r=>r.best).filter(v=>v!=null);
    const best = validPrices.length ? Math.min(...validPrices) : null;
    if(best!=null && best <= part.target){
      const bestStore = results.find(r=>r.best===best);
      const msg = `🔥 *PC Hunter ALERTA* 🔥\n*${part.cat}: ${part.name}*\nPreço: *${fmt(best)}* (alvo ${fmt(part.target)})\nLoja: ${bestStore.store}\nLink: ${bestStore.url}\nBusca exata: \`${part.search}\``;
      console.log(`  ✅ ALERTA DISPARADO — ${fmt(best)} ≤ ${fmt(part.target)}`);
      // beep
      process.stdout.write('\x07');
      await sendTelegram(msg);
      // WhatsApp — mesma msg, sem Markdown para CallMeBot
      const waMsg = `🔥 PC HUNTER ALERTA 🔥\n${part.cat}: ${part.name}\nPreço: ${fmt(best)} (alvo ${fmt(part.target)})\nLoja: ${bestStore.store}\nLink: ${bestStore.url}\nCORRE PRA COMPRAR!`;
      await sendWhatsApp(waMsg);
    } else if(best!=null){
      console.log(`  ⏳ acima do alvo por ${fmt(best - part.target)} (menor: ${fmt(best)})`);
    } else {
      console.log(`  ⚠️  Nenhum preço extraído — abra os links manualmente (anti-bot das lojas)`);
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
