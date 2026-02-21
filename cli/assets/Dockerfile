# Default Hyperbranch Execution Environment
FROM mcr.microsoft.com/devcontainers/typescript-node:22

RUN curl -LsSf https://aider.chat/install.sh | sh
RUN npm install -g opencode-ai

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# The workspace is mounted to /app at runtime
WORKDIR /app
