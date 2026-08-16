#!/usr/bin/env bash
# Aktualisiert die laufende Instanz auf den Stand des Repositorys.
# Auf dem Server ausführen:  ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

# Docker braucht auf vielen Systemen erhöhte Rechte.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

echo "› Änderungen holen"
# Den Branch ausdrücklich benennen: Nach "git init" in einem bestehenden
# Verzeichnis fehlt die Upstream-Verknüpfung, und ein blankes "git pull"
# bricht dann mit "no tracking information" ab.
branch="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "$branch"

# .env und data/ sind nicht im Repository und bleiben unangetastet.
if [ ! -f .env ]; then
  echo "  Es gibt keine .env – aus der Vorlage anlegen:  cp .env.example .env" >&2
  exit 1
fi

echo "› Image bauen und starten"
$DOCKER compose up -d --build

echo "› Warten, bis der Container gesund ist"
for _ in $(seq 1 30); do
  status=$($DOCKER inspect -f '{{.State.Health.Status}}' ownsteps 2>/dev/null || echo unknown)
  case "$status" in
    healthy) echo "  läuft"; exit 0 ;;
    unhealthy) echo "  Container meldet sich als ungesund:" >&2
               $DOCKER compose logs --tail 30 ownsteps >&2; exit 1 ;;
  esac
  sleep 2
done

echo "  Zeitüberschreitung – letzte Logzeilen:" >&2
$DOCKER compose logs --tail 30 ownsteps >&2
exit 1
