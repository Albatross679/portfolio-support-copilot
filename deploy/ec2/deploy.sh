#!/usr/bin/env bash
# Sync this worktree to EC2, install Docker if needed, and rebuild the Compose stack.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
source_aws_credentials
: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY must be exported in ~/.zshrc}"

[[ -f "$KEY_PATH" ]] || {
  echo "Missing SSH key: ${KEY_PATH}. Run deploy/ec2/provision.sh first." >&2
  exit 1
}
host="$(instance_host)"
[[ -n "$host" && "$host" != "None" ]] || {
  echo "The EC2 instance has no public IP address." >&2
  exit 1
}
SSH_OPTIONS=(-i "$KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
ssh_target="${REMOTE_USER}@${host}"

# Ubuntu cloud-init can still hold the apt lock immediately after boot.
ssh "${SSH_OPTIONS[@]}" "$ssh_target" 'set -e
for n in $(seq 1 30); do sudo apt-get update && break || sleep 10; done
sudo apt-get install -y ca-certificates curl
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo systemctl enable --now docker
sudo install -d -o ubuntu -g ubuntu /home/ubuntu/portfolio-support-copilot-staging
sudo install -d -o root -g root -m 0755 /opt/portfolio-support-copilot'

rsync -az --delete \
  --exclude '.git/' --exclude '.env' --exclude '.venv/' --exclude '.pytest_cache/' \
  --exclude '.ruff_cache/' --exclude '__pycache__/' --exclude 'web/node_modules/' \
  -e "ssh ${SSH_OPTIONS[*]}" "${REPO_ROOT}/" "${ssh_target}:/home/ubuntu/portfolio-support-copilot-staging/"

# Keep .env off both Git and the synced worktree. It is transferred only over this SSH session.
temp_env="$(mktemp)"
trap 'rm -f "$temp_env"' EXIT
umask 077
{
  printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY"
  printf 'OPENROUTER_MODEL=%s\n' "${OPENROUTER_MODEL:-openai/gpt-4.1-mini}"
  printf 'OPENROUTER_EMBEDDING_MODEL=%s\n' "${OPENROUTER_EMBEDDING_MODEL:-openai/text-embedding-3-small}"
  printf 'EMBEDDING_DIM=%s\n' "${EMBEDDING_DIM:-1536}"
  printf 'RESET_DEMO_DATA=0\n'
  printf 'OPENROUTER_BASE_URL=%s\n' "${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}"
} >"$temp_env"
chmod 600 "$temp_env"
scp "${SSH_OPTIONS[@]}" "$temp_env" "${ssh_target}:/home/ubuntu/portfolio-support-copilot-staging/runtime.env"

ssh "${SSH_OPTIONS[@]}" "$ssh_target" 'bash -s' <<'REMOTE'
set -euo pipefail
sudo rsync -a --delete --exclude=.env /home/ubuntu/portfolio-support-copilot-staging/ /opt/portfolio-support-copilot/
sudo install -m 600 -o root -g root /home/ubuntu/portfolio-support-copilot-staging/runtime.env /opt/portfolio-support-copilot/.env
rm -f /home/ubuntu/portfolio-support-copilot-staging/runtime.env
cd /opt/portfolio-support-copilot
sudo docker compose up -d --build
init_id=""
for n in $(seq 1 60); do
  init_id=$(sudo docker compose ps -aq init)
  if [ -n "$init_id" ] && [ "$(sudo docker inspect -f '{{.State.Status}}' "$init_id")" = exited ]; then
    break
  fi
  sleep 5
done
[ -n "$init_id" ]
[ "$(sudo docker inspect -f '{{.State.ExitCode}}' "$init_id")" = 0 ]
sudo docker compose ps
REMOTE

printf 'Deployed at http://%s:8000\n' "$host"
