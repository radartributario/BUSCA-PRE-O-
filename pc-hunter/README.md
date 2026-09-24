# PC Hunter — Monitor de Promoções para seu PC

Ferramenta que fica varrendo **KaBuM!, TerabyteShop, Pichau e Amazon Brasil** com o **texto exato** de cada peça e dispara **alerta instantâneo** (som + notificação + Telegram) quando o preço cai ≤ alvo.

## Peças configuradas (seu alvo)

| Peça | Busca exata | Gatilho |
|------|-------------|---------|
| 🧠 Ryzen 5 8600G 100-100001237BOX | `AMD Ryzen 5 8600G 100-100001237BOX` | ≤ R$ 970 |
| 🧩 Gigabyte B650M Gaming Plus WiFi | `Gigabyte B650M Gaming Plus WiFi AM5 DDR5 9MB65MGPW-00-10` | ≤ R$ 900 |
| 💾 Kingston Fury Beast 32GB DDR5 | `Kingston Fury Beast 32GB 2x16GB DDR5 6000 CL30 EXPO KF560C30BBEK2-32` | ≤ R$ 950 |
| 🚀 Kingston NV3 1TB | `Kingston NV3 1TB NVMe PCIe 4.0 SNV3S/1000G` | ≤ R$ 950 |
| ⚡ MSI MAG A650BN 650W | `MSI MAG A650BN 650W 80 Plus Bronze 306-7ZP2B22-CE0` | ≤ R$ 300 |
| 🖥️ Aigo DK352 Mesh 4 Fans | `Aigo DarkFlash DK352 Mesh 4 Fans DK352-MESH-4F` | ≤ R$ 300 |
| 🎮 RX 7600 8GB | `Radeon RX 7600 8GB GDDR6` | ≤ R$ 1.750 |
| 🎮 RTX 4060 8GB (alt) | `GeForce RTX 4060 8GB GDDR6` | ≤ R$ 1.900 |

Orçamento base (sem GPU): **R$ 5.360,00** no alvo. Com RX 7600: **R$ 7.110,00**.

---

## 1) Modo mais rápido (sem instalar nada) — `index.html`

1. Abra `pc-hunter/index.html` no navegador (duplo clique).
2. Clique em **Ativar Alertas** e permita notificações.
3. Escolha o intervalo (recomendado: **5 min**) e clique em **VERIFICAR TUDO AGORA** — abre 1 aba por peça no KaBuM! (use os botões da linha para abrir Terabyte/Pichau/Amazon).
4. Achou o menor preço? Clique no valor da peça e **cole o preço** (ex: `899.90`). Se ≤ alvo, o alarme toca na hora + popup mesmo em segundo plano.
5. Opcional: clique em **salvar link** para guardar o link exato da oferta — o botão **COMPRAR AGORA** vai direto para ele.

> Os preços ficam salvos no seu navegador (`localStorage`). Use ⚙️ → Exportar para backup.

**Atalhos:** `V` verifica tudo, `M` muta/desmuta.

## 2) Modo automático — `tracker.js` (Node.js, varre sozinho)

Para quem quer varredura 24h sem clicar:

```bash
node pc-hunter/tracker.js
# com Telegram (recomendado para alerta no celular):
TELEGRAM_BOT_TOKEN=123:ABC TELEGRAM_CHAT_ID=123456 INTERVAL_MIN=5 node pc-hunter/tracker.js
```

Crie seu bot no @BotFather e pegue o `chat_id` em `https://api.telegram.org/bot<TOKEN>/getUpdates`.

> Lojas têm anti-bot — o tracker tenta extrair `R$` do HTML e sempre mostra os links. Se vier "sem preço / bloqueado", abra os links no navegador (é o comportamento normal em algumas lojas).

## Dicas para não perder a promo

- **Texto exato**: sempre use o código completo (ex: `KF560C30BBEK2-32`) — filtra falsos positivos.
- **Pix/boleto**: KaBuM! e Terabyte mostram preço menor no pix — considere isso no alvo.
- **Fonte/Gabinete**: alvo em R$ 300 dá margem para frete; se achar por R$ 280, compre na hora.
- **GPUs**: são opcionais — o alerta só dispara se você informar o preço; não bloqueiam o resto do alerta.

## Estrutura

```
pc-hunter/
  index.html   → dashboard completo (recomendado)
  tracker.js   → varredura automática + Telegram
  README.md    → este arquivo
```

Boa caçada! 🎯 Quando tocar o alarme, não pense — clique em COMPRAR.
