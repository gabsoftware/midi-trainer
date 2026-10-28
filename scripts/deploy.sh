#!/usr/bin/env bash
# Vérifie, construit et publie l'application sur le serveur.
#
#   npm run deploy
#
# Les informations du serveur ne sont pas dans le dépôt : elles sont lues dans
# `.env.deploy` (ignoré par git, voir `.env.deploy.example`) ou dans l'environnement.
#   DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER : connexion SSH
#   DEPLOY_OWNER : utilisateur propriétaire du dossier publié (écriture via sudo -u)
#   DEPLOY_PATH : dossier publié par le serveur web
#   DEPLOY_URL : adresse publique, affichée à la fin
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env.deploy ]]; then
  # shellcheck source=/dev/null
  source .env.deploy
fi
for name in DEPLOY_HOST DEPLOY_PORT DEPLOY_USER DEPLOY_OWNER DEPLOY_PATH DEPLOY_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Variable manquante : ${name}. Copiez .env.deploy.example vers .env.deploy et complétez-le." >&2
    exit 1
  fi
done

npm test
npm run lint
npm run build

# Les fichiers sont écrits par le propriétaire du dossier (sudo -u), pas par l'utilisateur SSH.
# rsync envoie assets/ avant index.html : une page chargée pendant la copie trouve toujours ses fichiers.
# --delete-after : les anciens fichiers ne sont supprimés qu'une fois la nouvelle version en place.
rsync -rlt --delete-after --chmod=D755,F644 \
  -e "ssh -p ${DEPLOY_PORT}" \
  --rsync-path="sudo -u ${DEPLOY_OWNER} rsync" \
  dist/ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "Publié sur ${DEPLOY_URL}"
