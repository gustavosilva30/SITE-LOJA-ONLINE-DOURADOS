<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CRM Loja

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Configure `.env` / `.env.local` (ver `.env.example`)
3. Run the app: `npm run dev`

Backend: `npm run start-backend` ou `npm start`

---

## Segurança — Pre-commit Hooks

Este repositório usa [pre-commit](https://pre-commit.com) com [gitleaks](https://github.com/gitleaks/gitleaks)
para bloquear commits que contenham credenciais hardcoded (connection strings de banco,
API keys, tokens, etc.).

### Instalação (obrigatória para contribuidores)

```bash
pip install pre-commit
pre-commit install
```

Após instalar, o hook será executado automaticamente antes de cada `git commit`.
Para rodar manualmente em todos os arquivos:

```bash
pre-commit run --all-files
```

### ⚠️ Passos manuais pendentes (devem ser feitos fora do editor)

> **Atenção:** O histórico Git ainda contém a senha `Dourados1000` em commits anteriores.
> Os passos abaixo precisam ser executados **manualmente** pelo responsável do repositório,
> pois envolvem reescrita de histórico e force-push — ações que afetam todos os clones existentes.

1. **Rotacionar a senha do PostgreSQL** — altere `Dourados1000` no painel do banco (e atualize `DATABASE_URL` nas variáveis de ambiente de produção/staging).

2. **Limpar o histórico Git** com `git filter-repo` (recomendado) ou BFG Repo Cleaner:

   ```bash
   # Instalar: pip install git-filter-repo
   git filter-repo --replace-text <(echo 'postgresql://postgres:Dourados1000==>postgresql://postgres:REDACTED')
   # Ou para remover arquivos inteiros do histórico:
   git filter-repo --invert-paths --path test_query.py --path test_db2.py --path backend/fix_db.py ...
   ```

3. **Force-push** em todos os branches após a limpeza:

   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

4. **Notificar** todos os colaboradores para rebasear suas branches locais.
