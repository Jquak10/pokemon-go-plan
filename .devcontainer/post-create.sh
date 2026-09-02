#!/bin/sh
set -eu

npm ci

codex_config_dir=/root/.codex
codex_config_file="$codex_config_dir/config.toml"

if [ ! -e "$codex_config_file" ]; then
  mkdir -p "$codex_config_dir"
  install -m 600 .devcontainer/codex-config.toml "$codex_config_file"
fi

if gh auth status >/dev/null 2>&1; then
  gh auth setup-git
else
  echo 'GitHub CLI authentication required once: run gh auth login'
fi
