FROM python:3.12-slim

RUN apt-get update && apt-get install -y curl git xz-utils && rm -rf /var/lib/apt/lists/*

# Install Hermes Agent
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

# Copy Alfred-specific Hermes config
RUN mkdir -p /root/.hermes
COPY cli-config.yaml /root/.hermes/cli-config.yaml

EXPOSE 8642

CMD ["hermes", "gateway", "start"]
