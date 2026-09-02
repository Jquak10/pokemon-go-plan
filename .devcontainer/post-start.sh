#!/bin/sh
set -eu

if ! gh auth status >/dev/null 2>&1; then
  exit 0
fi

gh auth setup-git

github_login=$(gh api user --jq '.login')

if ! git config --local --get user.name >/dev/null 2>&1; then
  github_name=$(gh api user --jq '.name // .login')
  git config --local user.name "$github_name"
fi

if ! git config --local --get user.email >/dev/null 2>&1; then
  github_id=$(gh api user --jq '.id')
  git config --local user.email "${github_id}+${github_login}@users.noreply.github.com"
fi
