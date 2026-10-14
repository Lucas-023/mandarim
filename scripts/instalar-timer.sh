#!/usr/bin/env bash
# Instala um temporizador do systemd (modo usuário) que gera o pacote do dia
# todas as manhãs às 5h. Não usa sudo e não mexe em nada fora de ~/.config.
#
#   bash scripts/instalar-timer.sh            # instala e ativa
#   bash scripts/instalar-timer.sh --remover   # desativa e remove
#
# Alternativa sem systemd (cron), equivalente:
#   crontab -e  →  0 5 * * * cd <projeto> && /usr/bin/node tools/generate.js --quiet
set -euo pipefail

PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIDADES="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
NOME="mandarin-quest-pacote"
HORA="${HORA:-05:00}"

if [[ "${1:-}" == "--remover" ]]; then
  systemctl --user disable --now "$NOME.timer" 2>/dev/null || true
  rm -f "$UNIDADES/$NOME.service" "$UNIDADES/$NOME.timer"
  systemctl --user daemon-reload
  echo "Temporizador removido."
  exit 0
fi

command -v systemctl >/dev/null || { echo "systemd não encontrado; use a alternativa com cron (veja o topo deste arquivo)."; exit 1; }
NODE="$(command -v node)" || { echo "node não encontrado no PATH."; exit 1; }

# O gerador chama o Claude Code; o PATH do systemd é mínimo, então gravamos o
# diretório onde o `claude` está instalado dentro da unidade.
CLAUDE_DIR=""
if CLAUDE_BIN="$(command -v claude 2>/dev/null)"; then CLAUDE_DIR="$(dirname "$CLAUDE_BIN")"; fi
PATH_UNIDADE="/usr/local/bin:/usr/bin:/bin"
[[ -n "$CLAUDE_DIR" ]] && PATH_UNIDADE="$CLAUDE_DIR:$PATH_UNIDADE"

mkdir -p "$UNIDADES"

cat > "$UNIDADES/$NOME.service" <<UNIT
[Unit]
Description=Mandarin Quest — gera o pacote de estudo do dia
Documentation=file://$PROJETO/README.md

[Service]
Type=oneshot
WorkingDirectory=$PROJETO
Environment=PATH=$PATH_UNIDADE
Environment=HOME=$HOME
ExecStart=$NODE $PROJETO/tools/generate.js --quiet
# Se a geração falhar, o log fica no journal do usuário:
#   journalctl --user -u $NOME.service -n 50
UNIT

cat > "$UNIDADES/$NOME.timer" <<UNIT
[Unit]
Description=Gera o pacote do Mandarin Quest todos os dias às $HORA

[Timer]
OnCalendar=*-*-* $HORA:00
# Se a máquina estava desligada na hora marcada, roda assim que ligar:
Persistent=true
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now "$NOME.timer"

echo "Instalado. Próxima execução:"
systemctl --user list-timers "$NOME.timer" --no-pager || true
cat <<FIM

Comandos úteis:
  systemctl --user list-timers $NOME.timer     # quando roda de novo
  systemctl --user start $NOME.service         # gerar agora
  journalctl --user -u $NOME.service -n 50     # ver o log da última geração
  bash scripts/instalar-timer.sh --remover     # desinstalar

Observação: temporizadores de usuário só rodam enquanto houver sessão sua ativa.
Para que rodem mesmo sem login (ex.: máquina ligada mas deslogada), execute uma vez:
  loginctl enable-linger $USER
FIM
