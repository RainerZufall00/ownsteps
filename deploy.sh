#!/usr/bin/env bash
# Updates the running instance to the state of the repository.
# Run on the server:  ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

# On many systems Docker needs elevated privileges.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

echo "› Fetching changes"
# Name the branch explicitly: after "git init" in an existing directory the
# upstream link is missing, and a bare "git pull" then aborts with "no
# tracking information".
branch="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "$branch"

# .env and data/ are not in the repository and stay untouched.
if [ ! -f .env ]; then
  echo "  There is no .env – create it from the template:  cp .env.example .env" >&2
  exit 1
fi

echo "› Building and starting the image"
$DOCKER compose up -d --build

echo "› Waiting for the container to become healthy"
for _ in $(seq 1 30); do
  status=$($DOCKER inspect -f '{{.State.Health.Status}}' ownsteps 2>/dev/null || echo unknown)
  case "$status" in
    healthy) echo "  running"; exit 0 ;;
    unhealthy) echo "  Container reports itself as unhealthy:" >&2
               $DOCKER compose logs --tail 30 ownsteps >&2; exit 1 ;;
  esac
  sleep 2
done

echo "  Timed out – last log lines:" >&2
$DOCKER compose logs --tail 30 ownsteps >&2
exit 1
