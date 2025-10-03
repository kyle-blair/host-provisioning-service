#!/usr/bin/env bash
set -euo pipefail

if ! command -v podman >/dev/null 2>&1; then
	echo "podman is required to run the container" >&2
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${IMAGE_NAME:-host-provisioning-service:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-host-provisioning-service}"
PORT="${PORT:-8080}"
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"

mkdir -p "${DATA_DIR}"

if podman ps -a --format '{{.Names}}' | grep -Fx "${CONTAINER_NAME}" >/dev/null 2>&1; then
	podman rm -f "${CONTAINER_NAME}" >/dev/null
fi

podman run \
	--name "${CONTAINER_NAME}" \
	--publish "${PORT}:8080" \
	--volume "${DATA_DIR}:/app/content:Z" \
	--env "port=8080" \
	--env "insecure=true" \
	--detach \
	"${IMAGE_NAME}"

echo "Container '${CONTAINER_NAME}' is running on port ${PORT}."
