#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# setup.sh — Install curve-zenmoney-sync as a Podman Quadlet system service
# Run as root (sudo ./setup.sh) from the project root or from quadlet/
# Idempotent: safe to run multiple times.
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(realpath "${SCRIPT_DIR}/..")"
CONTAINER_FILE="${SCRIPT_DIR}/curve-zenmoney-sync.container"
SYSTEMD_QUADLET_DIR="/etc/containers/systemd"
SYMLINK_TARGET="${SYSTEMD_QUADLET_DIR}/curve-zenmoney-sync.container"
ENV_SOURCE="${PROJECT_DIR}/.env"
ENV_DEST_DIR="/etc/curve-zenmoney-sync"
ENV_DEST="${ENV_DEST_DIR}/.env"
SERVICE_NAME="curve-zenmoney-sync.service"
IMAGE_NAME="localhost/curve-zenmoney-sync:latest"
BUILD_HASH_FILE="${ENV_DEST_DIR}/.build-hash"

# Files that affect the container image — changes to any of these trigger a rebuild
BUILD_SOURCES=(
  "${PROJECT_DIR}/Dockerfile"
  "${PROJECT_DIR}/package.json"
  "${PROJECT_DIR}/package-lock.json"
  "${PROJECT_DIR}/src"
)

# --- Preflight checks -------------------------------------------------------

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (use sudo)." >&2
  exit 1
fi

if [[ ! -f "${CONTAINER_FILE}" ]]; then
  echo "ERROR: Container file not found at ${CONTAINER_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_SOURCE}" ]]; then
  echo "ERROR: .env file not found at ${ENV_SOURCE}" >&2
  echo "  Copy .env.example to .env and fill in all required values." >&2
  exit 1
fi

# --- Build container image --------------------------------------------------

# Compute a hash of all files that affect the image.
# find is used to enumerate src/ recursively so any file addition/removal is detected.
current_hash=$(find "${BUILD_SOURCES[@]}" -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)

stored_hash=""
if [[ -f "${BUILD_HASH_FILE}" ]]; then
  stored_hash=$(cat "${BUILD_HASH_FILE}")
fi

if ! podman image exists "${IMAGE_NAME}" || [[ "${current_hash}" != "${stored_hash}" ]]; then
  if ! podman image exists "${IMAGE_NAME}"; then
    echo "==> Image not found — building ..."
  else
    echo "==> Build sources changed — rebuilding ..."
  fi

  echo "==> Installing dependencies ..."
  npm ci --prefix "${PROJECT_DIR}"

  echo "==> Compiling TypeScript ..."
  npm run --prefix "${PROJECT_DIR}" build

  echo "==> Building container image ${IMAGE_NAME} ..."
  podman build -t "${IMAGE_NAME}" "${PROJECT_DIR}"

  mkdir -p "${ENV_DEST_DIR}"
  echo "${current_hash}" > "${BUILD_HASH_FILE}"
else
  echo "==> Build sources unchanged, skipping build."
fi

# --- Install .env -----------------------------------------------------------

echo "==> Setting up environment config directory ${ENV_DEST_DIR} ..."
mkdir -p "${ENV_DEST_DIR}"
chmod 700 "${ENV_DEST_DIR}"

# Symlink so edits to .env in the project directory take effect on next
# service restart without re-running setup.sh.
# NOTE: The project directory must not be moved after running this script.
if [[ -L "${ENV_DEST}" ]]; then
  echo "    Symlink already exists at ${ENV_DEST}, updating ..."
  ln -sf "$(realpath "${ENV_SOURCE}")" "${ENV_DEST}"
elif [[ -e "${ENV_DEST}" ]]; then
  echo "    WARNING: ${ENV_DEST} exists but is not a symlink. Replacing ..."
  rm -f "${ENV_DEST}"
  ln -s "$(realpath "${ENV_SOURCE}")" "${ENV_DEST}"
else
  ln -s "$(realpath "${ENV_SOURCE}")" "${ENV_DEST}"
fi
echo "    .env symlinked to ${ENV_DEST}"

# --- Install Quadlet unit file ----------------------------------------------

echo "==> Installing Quadlet unit file ..."
mkdir -p "${SYSTEMD_QUADLET_DIR}"

if [[ -L "${SYMLINK_TARGET}" ]]; then
  echo "    Symlink already exists at ${SYMLINK_TARGET}, updating ..."
  ln -sf "$(realpath "${CONTAINER_FILE}")" "${SYMLINK_TARGET}"
elif [[ -e "${SYMLINK_TARGET}" ]]; then
  echo "    WARNING: ${SYMLINK_TARGET} exists but is not a symlink. Replacing ..."
  rm -f "${SYMLINK_TARGET}"
  ln -s "$(realpath "${CONTAINER_FILE}")" "${SYMLINK_TARGET}"
else
  ln -s "$(realpath "${CONTAINER_FILE}")" "${SYMLINK_TARGET}"
  echo "    Symlink created: ${SYMLINK_TARGET}"
fi

# --- Reload systemd and start service ---------------------------------------

echo "==> Reloading systemd daemon ..."
systemctl daemon-reload

echo "==> Restarting ${SERVICE_NAME} ..."
systemctl restart "${SERVICE_NAME}"

echo ""
echo "==> Service status:"
systemctl status "${SERVICE_NAME}" --no-pager || true
