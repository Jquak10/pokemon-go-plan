FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

USER root

RUN apt-get update && \
    apt-get install -y \
      git \
      gh \
      curl \
      ca-certificates \
      jq \
      openssh-client \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex wrangler

WORKDIR /workspace