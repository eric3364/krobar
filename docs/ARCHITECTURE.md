> ⚠️ **DOCUMENT DE RÉFÉRENCE — NE PAS MODIFIER**
>
> Ce fichier décrit l'architecture réelle de Krobar (frontend, edge function Supabase, backend FastAPI, infrastructure VPS). Il est maintenu manuellement par le propriétaire du projet, à partir d'observations directes sur la production.
>
> **Pour Lovable et tout assistant IA** : ce document doit être consulté avant toute modification non triviale, mais ne doit jamais être édité automatiquement. Si tu identifies une incohérence entre ce doc et la réalité du code, signale-la dans ta réponse plutôt que de modifier le fichier.
>
> Dernière mise à jour : 4 mai 2026

---

# Architecture Krobar — Documentation technique

> **Date de rédaction** : 4 mai 2026
> **État** : production stable, pipeline auto-deploy opérationnel
> **Auteur** : doc générée à l'issue de la session de stabilisation des 3-4 mai 2026

---

## 1. Vue d'ensemble

Krobar est une application web qui transforme du texte (extraits de cours, paragraphes, idées) en visuels SVG (à la manière de Napkin AI). L'utilisateur colle un texte, choisit une palette de couleurs, et l'application propose 3 templates SVG pertinents qu'il peut prévisualiser, personnaliser et exporter en SVG ou PNG.

### Domaine et accès
- **URL publique** : `https://krobar.online`
- **Certificat** : Let's Encrypt (renouvellement auto)
- **Environnement** : production unique (pas de staging séparé pour l'instant)

### Composants principaux

```
┌─────────────────────────────────────────────────────────────────┐
│                        Utilisateur final                        │
│                       (navigateur web)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            Frontend React/Vite (krobar.online)                  │
│            servi par Nginx depuis /var/www/krobar.online/dist/  │
│            Code source édité dans Lovable                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST JSON
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│      Edge function Supabase "krobar-proxy"                      │
│      URL: ltvgjhiqqierpztzjmyv.supabase.co/functions/v1/...     │
│      Région: eu-west-3                                          │
│      Rôle: forward + injection de palette + nettoyage XML       │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS vers krobar.online/api/*
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Nginx (reverse proxy)                        │
│              proxy_pass /api/ → 127.0.0.1:8000                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│       Backend FastAPI (uvicorn, port 8000)                      │
│       /opt/kroki/api/main.py                                    │
│       Templates: /opt/kroki/templates/*.svg (50 fichiers)       │
│       ← SOURCE UNIQUE DE VÉRITÉ pour les SVG                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure VPS

### Serveur
- **Hostname** : `srv1161379`
- **OS** : Ubuntu 22.04.5 LTS (Jammy Jellyfish)
- **IPv4 publique** : `72.61.197.43`
- **IPv6 publique** : `2a02:4780:28:b75::1` (à NE PAS utiliser pour les déploiements automatiques)
- **Hébergeur** : Hostinger
- **Accès SSH** : root, port 22

### Service backend (systemd)

```
Service     : kroki.service
État        : active
ExecStart   : /opt/kroki/api/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
WorkingDir  : /opt/kroki/api
User        : root
```

> ⚠️ **Note de sécurité** : le service tourne en `root`. À envisager : créer un utilisateur dédié `krobar` et migrer le service. Non bloquant pour l'instant car l'API n'écoute qu'en `127.0.0.1` (Nginx fait le reverse proxy).

### Configuration Nginx

Fichier : `/etc/nginx/sites-available/krobar.online`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name krobar.online www.krobar.online;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name krobar.online www.krobar.online;

    ssl_certificate /etc/letsencrypt/live/krobar.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/krobar.online/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/krobar.online/dist;
    index index.html;

    # Templates SVG servis directement depuis le backend (filet de sécurité mode dégradé)
    location /templates/ {
        alias /opt/kroki/templates/;
        add_header Cache-Control "public, max-age=3600";
    }

    # React SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Assets statiques (cache long)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> 🔍 **Observation** : la directive `location /templates/` pointe vers `/opt/kroki/templates/`, donc Nginx peut servir les SVG depuis le backend en cas de besoin. En pratique, l'application passe toujours par l'edge function Supabase qui appelle `/api/render`, donc cette directive est un filet de sécurité.

---

## 3. Backend FastAPI

### Localisation et structure

```
/opt/kroki/
├── api/                              # Code Python du backend
│   ├── main.py                       # API FastAPI (endpoints)
│   ├── prompt_intelligent.py         # Logique IA pour matching texte → templates
│   ├── requirements.txt              # Dépendances pip
│   ├── venv/                         # Virtualenv Python
│   ├── __pycache__/
│   └── main.py.backup-*              # Anciennes versions (à nettoyer)
├── templates/                        # 50 fichiers SVG (source de vérité)
│   ├── *.svg
│   └── manifest.json                 # Métadonnées des templates
├── templates_backup_20260504_081736/ # Backup de la session du 4 mai
├── data/                             # Données runtime (DB, cache ?)
├── krobar/                           # Notes de session (SESSION_LOG.md, ROADMAP.md)
└── logs/                             # Logs applicatifs
```

> 🧹 **Dette technique identifiée** : les fichiers `main.py.backup-*` (avant-test, before-render-fix, before-promptv2…) encombrent le dossier `api/`. À nettoyer dans une future session de housekeeping.

### Endpoints exposés

| Méthode | Endpoint | Rôle |
|---------|----------|------|
| GET | `/api/health` | Health check |
| GET | `/api/templates` | Liste des 50 templates (manifest) |
| GET | `/api/test-texts` | Textes d'exemple pour tester l'app |
| POST | `/api/analyze` | Analyse un texte → propose 3 templates pertinents |
| POST | `/api/render` | Rend un template avec slots + palette → retourne SVG |
| GET | `/api/admin/template/drafts` | Liste les drafts de templates (admin) |
| POST | `/api/admin/template/create` | Crée un template (admin) |
| POST | `/api/admin/template/validate` | Valide un template (admin) |
| POST | `/api/admin/template/deploy` | Déploie un template (admin) |

### Templates SVG

- **50 fichiers** dans `/opt/kroki/templates/`
- **Phase 1** (création initiale) : 20 templates de base (process_3_steps, fishbone, swot_matrix, comparison_2_columns, mindmap_central, etc.)
- **Phase 2** (ajout du 3 mai) : 30 templates supplémentaires (asymmetric_mindmap, lighthouse_beacon, mountain_timeline, rocket_innovation, watercolor_effect, whiteboard_effect, etc.)
- **Format** : SVG paramétrables avec slots de texte (`{{title}}`, `{{step_1}}`, etc.) et palette via variables CSS (`var(--primary)`, `var(--accent)`, `var(--bg)`, `var(--text)`, `var(--muted)`, `var(--surface)`, `var(--border)`)

Le backend remplit les slots avec le texte de l'utilisateur et l'edge function injecte la palette via un attribut `style="--primary:...; --bg:...; ..."` sur la balise `<svg>` racine.

---

## 4. Frontend React/Vite (Lovable)

### Localisation

```
/var/www/krobar.online/
├── src/                          # Code source React (édité par Lovable)
│   ├── pages/
│   │   └── Index.tsx             # Page principale de l'app
│   ├── palettes.ts               # 10 palettes de couleurs définies
│   └── ...
├── public/
│   └── templates/                # Copies des SVG (mode dégradé) — 50 fichiers
├── dist/                         # Build Vite (généré, servi par Nginx)
│   └── templates/                # 50 SVG (copiés depuis public/ par le build)
├── supabase/
│   ├── config.toml
│   └── functions/                # 3 edge functions
│       ├── krobar-proxy/         # Proxy principal vers le backend
│       ├── png-to-svg/           # Conversion PNG → SVG
│       └── set-password/         # Gestion mot de passe (admin ?)
├── .github/workflows/
│   └── deploy.yml                # Auto-deploy GitHub Actions
├── package.json
├── vite.config.ts
└── deploy_frontend.sh            # Script manuel (vestige d'avant CI/CD)
```

### Repo GitHub
- **Origin** : `https://github.com/eric3364/krobar`
- **Branche principale** : `main`
- **Connexion Lovable** : bidirectionnelle (Lovable édite et pousse sur GitHub)
- **Identité Git du VPS** : `Krobar Deploy <deploy@krobar.online>`

### Palettes (src/palettes.ts)

10 palettes définies, chacune avec 7 propriétés (`primary`, `accent`, `bg`, `text`, `muted`, `surface`, `border`) :

| Palette | primary | accent | bg |
|---------|---------|--------|-----|
| Océan (défaut) | #0F2A44 | #2563EB | #FAFAF9 |
| Forêt | #064E3B | #10B981 | #FBFCF9 |
| Crépuscule | #581C87 | #C2410C | #FBF7F0 |
| Aurore | #BE185D | #FBBF24 | #FFFBF5 |
| Encre | #18181B | #525252 | #FAFAFA |
| Corail | #7C2D12 | #F97316 | #FFF8F4 |
| Menthe | #134E4A | #14B8A6 | #F5FBFA |
| Lavande | #3730A3 | #A78BFA | #FAF8FF |
| Sable | #44403C | #B45309 | #FBF8F1 |
| Ardoise | #1E293B | #38BDF8 | #F8FAFC |

### Toggle "Fond blanc" (ajouté le 4 mai 2026)

Un toggle UI permet à l'utilisateur de garder les couleurs de la palette pour les éléments actifs (textes, accents, bordures) tout en forçant le fond à `#ffffff` au lieu de la teinte douce de la palette. Utile pour les supports d'impression ou les présentations sur fond blanc.

Implémentation : variable `whiteBackground` (state React) qui, si `true`, modifie `palette.bg` en `#ffffff` avant l'envoi au proxy.

---

## 5. Edge function Supabase "krobar-proxy"

### Identité Supabase
- **Project ref** : `ltvgjhiqqierpztzjmyv`
- **URL fonction** : `https://ltvgjhiqqierpztzjmyv.supabase.co/functions/v1/krobar-proxy`
- **Région** : `eu-west-3`
- **Runtime** : Deno
- **Code source** : `/var/www/krobar.online/supabase/functions/krobar-proxy/index.ts`

### Configuration (extrait du code)

```typescript
const KROBAR_API_BASE = "https://krobar.online/api";
const PUBLIC_ENDPOINTS = ["analyze", "render", "templates", "health", "test-texts"];
```

### Rôle

1. **Reçoit** les requêtes du frontend (POST avec endpoint + payload)
2. **Forward** vers le backend FastAPI via `https://krobar.online/api/{endpoint}`
3. **Injecte** la palette utilisateur dans le SVG retourné via un attribut `style="--primary:...; --bg:...; ..."` sur la balise `<svg>`
4. **Nettoie** les attributs `style` en double sur la balise `<svg>` (si le SVG contenait déjà une palette hardcodée, elle est supprimée pour ne garder que la palette utilisateur)

### Authentification

Les endpoints publics (`analyze`, `render`, `templates`, `health`, `test-texts`) sont accessibles sans authentification. Les endpoints admin (`/admin/template/*`) requièrent un header `x-admin-token`.

### Headers identifiables dans les réponses

- `X-Served-By: supabase-edge-runtime`
- `Sb-Project-Ref: ltvgjhiqqierpztzjmyv`

### Déploiement

Lovable Cloud gère le déploiement de l'edge function (push GitHub → redéploiement Supabase via Lovable). Aucune action manuelle requise, mais **un smoke test post-déploiement est conseillé** pour vérifier que Lovable a bien redéployé.

---

## 6. Pipeline auto-deploy (GitHub Actions)

### Workflow

Fichier : `/var/www/krobar.online/.github/workflows/deploy.yml`

```yaml
name: Deploy to VPS
on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Decode SSH key into env var
        id: decode
        run: |
          DECODED_KEY=$(echo "${{ secrets.VPS_SSH_KEY_B64 }}" | base64 -d)
          {
            echo 'DECODED_SSH_KEY<<EOF_KEY'
            echo "$DECODED_KEY"
            echo 'EOF_KEY'
          } >> $GITHUB_ENV

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ env.DECODED_SSH_KEY }}
          port: 22
          timeout: 60s
          command_timeout: 10m
          script: |
            set -e
            cd /var/www/krobar.online
            git fetch origin main
            git reset --hard origin/main
            npm install
            npm run build
            ls -la dist/ | head -5
```

### Secrets GitHub configurés

| Secret | Contenu |
|--------|---------|
| `VPS_HOST` | `72.61.197.43` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY_B64` | Clé SSH ed25519 dédiée, encodée en base64 |
| `VPS_SSH_KEY` | (legacy, non utilisé) |

### Clé SSH dédiée

- **Localisation** : `/root/.ssh-deploy/krobar_deploy_key`
- **Type** : ed25519
- **Empreinte** : `SHA256:nF1/wkhIopwe8u3T8rMc1jSqZSNimhKtxe3/ah2eD7U`
- **Comment** : `github-actions-krobar-deploy`
- **Autorisée dans** : `/root/.ssh/authorized_keys`

### Token GitHub PAT (pour push depuis le VPS)

- **Nom** : `krobar-vps-push`
- **Type** : Fine-grained PAT
- **ID** : 14219528
- **Expiration** : 3 juillet 2026
- **Permissions** : Contents R/W + Workflows R/W sur `eric3364/krobar`

### Déclenchement

Le workflow se déclenche automatiquement à chaque push sur `main`. Il peut aussi être lancé manuellement depuis l'onglet Actions de GitHub (`workflow_dispatch`).

### Durée typique
- ~30 secondes par déploiement complet (pull + npm install + npm run build)

### Push depuis le VPS

Pour pousser un commit depuis le VPS et déclencher l'auto-deploy :

```bash
 export GH_TOKEN="github_pat_TON_TOKEN"   # noter l'espace devant pour ne pas garder le token dans l'historique
cd /var/www/krobar.online
git push "https://eric3364:${GH_TOKEN}@github.com/eric3364/krobar.git" main
unset GH_TOKEN
```

---

## 7. Outil de vérification (smoke test)

### Localisation

`/root/krobar-tools/smoke-test.sh`

### Rôle

Vérifier en quelques secondes que la chaîne complète (frontend + edge function + backend) fonctionne en production. Permet de démasquer les "déploiements fantômes" de Lovable Cloud.

### Tests effectués

1. **Site web accessible** : `krobar.online` répond en 200
2. **Edge function accessible** : POST sur `krobar-proxy` retourne du JSON valide
3. **Pas de bug XML** : un seul attribut `style` sur la balise `<svg>` retournée (le bug du 4 mai matin était deux `style` superposés)
4. **Backend accessible** : `/api/templates` répond en 200
5. **Couverture des templates** : le backend connaît au moins 40 templates (objectif : 50)

### Sortie

- ✅ `TOUT VA BIEN — 5/5 tests réussis` si tout passe
- ❌ `X ÉCHECS sur 5` avec détail des erreurs si problème

### Usage recommandé

À lancer après chaque modification Lovable, pour vérifier que le déploiement a bien eu lieu :

```bash
/root/krobar-tools/smoke-test.sh
```

---

## 8. Stratégie de déploiement et de gouvernance

### Principe directeur

**Lovable est la plateforme unique** pour l'édition du code (frontend + edge functions). L'équipe travaille dans Lovable, qui pousse les changements sur GitHub. Cette approche unifie le workflow et reste accessible aux non-techniques.

### Garde-fous techniques

Pour ne pas dépendre aveuglément de Lovable Cloud, deux garde-fous sont en place :

1. **Auto-deploy GitHub Actions** : à chaque push sur `main`, le frontend est rebuild et déployé sur le VPS. Le déploiement est traçable dans l'historique GitHub Actions (rond vert / rouge).

2. **Smoke test** : permet de vérifier objectivement en 3 secondes que la prod fonctionne réellement, et donc que les "c'est déployé" de Lovable correspondent à la réalité.

### Workflow type pour une modification

1. L'utilisateur prompte Lovable avec une demande précise (en s'appuyant sur la connaissance de l'archi du repo)
2. Lovable édite le code et pousse sur GitHub
3. GitHub Actions rebuilde le frontend en ~30s
4. L'utilisateur lance `/root/krobar-tools/smoke-test.sh`
5. Si 5/5 ✅ : modification validée. Si échec : preuve technique pour reprompter Lovable

### Source de vérité unique pour les SVG

Les templates SVG sont stockés à **un seul endroit canonique** : `/opt/kroki/templates/` côté backend. Les copies dans `public/templates/` et `dist/templates/` (côté frontend) sont des **fallbacks** utilisés uniquement si le backend ne répond pas. Elles sont synchronisées à la main quand de nouveaux templates sont ajoutés (et c'est ce qu'on a fait le 4 mai pour passer de 20 à 50).

---

## 9. Historique des points sensibles résolus (3-4 mai 2026)

### Bug "Style count: 2" (Attribute style redefined)
**Symptôme** : Chrome console erreur "Attribute style redefined" sur certaines vignettes.
**Cause** : 6 SVG avaient une palette hardcodée sur leur balise `<svg>`, et le proxy Supabase ajoutait une seconde palette sans supprimer la première.
**Fix** :
1. Edge function : regex qui supprime tous les `style=` puis réinjecte uniquement la palette utilisateur (commit `c087d6c`)
2. Backend : suppression manuelle des palettes hardcodées des 6 SVG concernés (iceberg, lighthouse_beacon, mountain_timeline, pots_plants_evolution, process_5_steps, rocket_innovation)

### Désynchronisation manifest
**Symptôme** : `dist/templates/manifest.json` n'avait que 20 templates alors que le backend en avait 50.
**Fix** : copie du manifest backend → `public/templates/manifest.json` (commit `6989c13`), build automatique pour aligner `dist/`.

### Désynchronisation SVG
**Symptôme** : `public/templates/` et `dist/templates/` n'avaient que 20 SVG (Phase 1) alors que le backend en avait 50.
**Fix** : copie des 50 SVG du backend → `public/templates/` (commit `ea1e224`).

### Mise en place de l'auto-deploy
- Création de la clé SSH dédiée
- Configuration des secrets GitHub
- Création du workflow `deploy.yml`
- Difficultés résolues : passage IPv6 → IPv4, `VPS_USER` qui contenait `root@srv1161379` au lieu de `root`, encodage base64 multi-lignes de la clé SSH

---

## 10. Points en suspens et améliorations possibles

### À faire prochainement
- [ ] Nettoyage des fichiers `main.py.backup-*` dans `/opt/kroki/api/`
- [ ] Documenter / explorer les edge functions `png-to-svg` et `set-password`
- [ ] Documenter le format exact du `manifest.json` (champs : id, name, category, description, file, slots, best_for)

### À envisager à plus long terme
- [ ] Migrer le service `kroki.service` vers un utilisateur non-root
- [ ] Ajouter un alias bash `krobar-check` pour lancer le smoke test plus rapidement
- [ ] Intégrer le smoke test dans le workflow GitHub Actions (échec si la prod est cassée après déploiement)
- [ ] Mettre en place un environnement de staging séparé
- [ ] Ajouter des tests automatisés du rendu visuel des templates (ex. screenshot diff)

### Décisions actées (à ne pas remettre en cause sans raison)
- **Lovable est la plateforme d'édition** : pas de migration vers GitHub Actions pour les edge functions tant que l'équipe est petite/non-technique
- **Une seule source de vérité pour les SVG** : `/opt/kroki/templates/` côté backend
- **Mode dégradé maintenu** : les copies frontend (public/dist) restent en place comme filet de sécurité

---

## Annexes

### A. Comptes et accès

| Service | Identité | Rôle |
|---------|----------|------|
| GitHub | `eric3364` | Propriétaire du repo `krobar` |
| Lovable | (compte associé GitHub) | Édition frontend + edge functions |
| Supabase (via Lovable Cloud) | Project `ltvgjhiqqierpztzjmyv` | Hébergement edge functions |
| VPS Hostinger | `root@srv1161379` | Accès SSH |
| Domaine | `krobar.online` | Hostinger |

### B. Commandes utiles (cheat sheet)

```bash
# Vérifier l'état de la prod
/root/krobar-tools/smoke-test.sh

# Compter les SVG dans les 3 emplacements
echo "Backend : $(ls /opt/kroki/templates/*.svg | wc -l)"
echo "Public  : $(ls /var/www/krobar.online/public/templates/*.svg | wc -l)"
echo "Dist    : $(ls /var/www/krobar.online/dist/templates/*.svg | wc -l)"

# Vérifier l'état du backend
systemctl status kroki.service

# Voir les logs du backend
journalctl -u kroki.service -f

# Tester directement le backend
curl http://127.0.0.1:8000/api/health

# Tester l'edge function
curl -X POST https://ltvgjhiqqierpztzjmyv.supabase.co/functions/v1/krobar-proxy \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"templates","payload":{}}'

# Voir les workflows GitHub Actions
# → https://github.com/eric3364/krobar/actions

# Push manuel depuis le VPS
 export GH_TOKEN="github_pat_..."
cd /var/www/krobar.online && \
  git push "https://eric3364:${GH_TOKEN}@github.com/eric3364/krobar.git" main && \
  unset GH_TOKEN
```

### C. Contacts d'urgence

- **Hostinger support** : pour problèmes VPS / IPv4
- **Lovable support** : pour problèmes de déploiement edge functions
- **Supabase support** : (via Lovable Cloud, pas d'accès direct)
