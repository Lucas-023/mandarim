#!/usr/bin/env bash
# Abre só os flashcards do Baralho no computador (modo foco). O nome do arquivo
# ficou da antiga aba Vocabulário, que virou parte do Baralho em 2026-11-09.
#
# Usa o servidor local (dados em data/state.json, com backups). Se ele não
# estiver rodando, sobe em segundo plano e deixa ligado: fechar o navegador
# não perde nada, e abrir de novo é instantâneo.
#
#   npm run vocab                     abre agora
#   npm run vocab:atalho              põe "Mandarim — Baralho" no menu de aplicativos
#   bash scripts/abrir-vocabulario.sh --atalho   (o mesmo que o anterior)
set -euo pipefail

PASTA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTA="${PORT:-8000}"
URL="http://127.0.0.1:${PORTA}/#/deck?foco=1"

if [[ "${1:-}" == "--atalho" ]]; then
  destino="${XDG_DATA_HOME:-$HOME/.local/share}/applications/mandarim-vocabulario.desktop"
  mkdir -p "$(dirname "$destino")"
  cat > "$destino" <<EOF
[Desktop Entry]
Type=Application
Name=Mandarim — Baralho
Comment=Flashcards do Mandarin Quest (curso + pacotes do dia)
Exec=bash "$PASTA/scripts/abrir-vocabulario.sh"
Icon=$PASTA/icone.svg
Terminal=false
Categories=Education;
EOF
  chmod +x "$destino"
  echo "Atalho criado: procure \"Mandarim\" no menu de aplicativos."
  echo "($destino)"
  exit 0
fi

no_ar() { curl -fs -o /dev/null --max-time 1 "http://127.0.0.1:${PORTA}/"; }

if ! no_ar; then
  command -v node >/dev/null || { echo "Node não encontrado no PATH." >&2; exit 1; }
  mkdir -p "$PASTA/data"
  # setsid + nohup: o servidor sobrevive ao fechar o terminal ou o atalho.
  (cd "$PASTA" && setsid nohup node server.mjs >>"$PASTA/data/servidor.log" 2>&1 &)
  for _ in $(seq 1 50); do no_ar && break; sleep 0.1; done
  no_ar || { echo "O servidor não subiu. Veja $PASTA/data/servidor.log" >&2; exit 1; }
fi

xdg-open "$URL" >/dev/null 2>&1 &
echo "Abrindo $URL"
