# Deploy 24h com PC desligado — passo a passo (2 min)

## O que já está pronto
- `pc-hunter/tracker.js` com seu Zap: 5511992586143 / apikey 2626517
- `.github/workflows/hunter.yml` roda a cada 10 min na nuvem, mesmo com PC desligado

## Passo 1 — Criar repositório no GitHub (1 min)
1. Acesse https://github.com/new
2. Nome: `pc-hunter` (pode ser privado)
3. NÃO marque "Initialize with README"
4. Clique Create repository

## Passo 2 — Enviar código (cole no terminal, na pasta do projeto)
```bash
git remote add origin https://github.com/SEU_USUARIO/pc-hunter.git
git branch -M main
git push -u origin main
```

## Passo 3 — Configurar Zap nos Secrets (30 seg)
1. No GitHub: seu repo > Settings > Secrets and variables > Actions > New repository secret
2. Crie 2 secrets:
   - Name: `WHATSAPP_PHONE` Value: `5511992586143`
   - Name: `WHATSAPP_APIKEY` Value: `2626517`
3. Salve

## Passo 4 — Testar
1. No GitHub: Actions > PC Hunter 24h > Run workflow > Run workflow
2. Aguarde 30s > veja logs > deve aparecer "Message queued" e chegar no seu Zap

Pronto! A partir daí roda sozinho a cada 10 min, 24h por dia, PC desligado.

Para mudar intervalo: edite `.github/workflows/hunter.yml:5` cron `*/10` para `*/5` (5 min) etc.
Para parar: GitHub > Actions > desative o workflow.
