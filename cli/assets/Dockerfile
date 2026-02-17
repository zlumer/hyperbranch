# Default Hyperbranch Execution Environment
FROM mcr.microsoft.com/devcontainers/typescript-node:22

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# The workspace is mounted to /app at runtime
WORKDIR /app
