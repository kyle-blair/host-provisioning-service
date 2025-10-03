#!/usr/bin/env bash
set -euo pipefail

if ! command -v podman >/dev/null 2>&1; then
	echo "podman is required to build the image" >&2
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${IMAGE_NAME:-host-provisioning-service:latest}"

podman build \
	--file "${SCRIPT_DIR}/containerfile" \
	--tag "${IMAGE_NAME}" \
	"${SCRIPT_DIR}"
