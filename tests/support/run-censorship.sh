#!/usr/bin/env bash
# Runs tests/integration/censorship.ts against four local nodes without Docker.
#
# Needs a local Postgres (superuser reachable as $PGURL) and Redis on :6379.
# Recreates databases sipher_a..sipher_d, so do not point it at real data.
#
#   PGURL=postgresql://postgres@localhost:5432 tests/support/run-censorship.sh [--only S2,S3]
set -euo pipefail
cd "$(dirname "$0")/../.."

PGURL="${PGURL:-postgresql://postgres@localhost:5432}"
REDIS="${REDIS:-redis://localhost:6379}"

if ! grep -q "sipher-d" /etc/hosts; then
	echo "127.0.0.1 sipher-a sipher-b sipher-c sipher-d" >> /etc/hosts
fi

bun run tests/docker/generate-keys.ts >/dev/null
for id in a b c d; do
	f="tests/docker/sipher-$id.env"
	sed -i "s#postgresql://sipher:sipher_test@postgres:5432#${PGURL}#; s#redis://redis:6379#${REDIS}#; s#^DEV_ALLOWED_HOSTNAMES=.*#DEV_ALLOWED_HOSTNAMES=sipher-a,sipher-b,sipher-c,sipher-d#" "$f"
	psql "$PGURL/postgres" -qc "drop database if exists sipher_$id with (force);" -c "create database sipher_$id;"
	(set -a; . "./$f"; set +a; bunx drizzle-kit push --force >/dev/null)
	redis-cli -u "$REDIS/$(grep '^REDIS_URL' "$f" | sed 's#.*/##')" flushdb >/dev/null
done

exec bun tests/integration/censorship.ts "$@"
