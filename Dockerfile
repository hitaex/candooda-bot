FROM oraclelinux:9-slim

# Install Bun and minimal build tools
RUN microdnf -y update || true \
 && microdnf -y install curl tar gzip gnupg libstdc++ libgcc || true \
 && curl -fsSL https://bun.sh/install | bash \
 && export PATH="/root/.bun/bin:$PATH" \
 && /root/.bun/bin/bun --version \
 && microdnf clean all || true

ENV PATH="/root/.bun/bin:$PATH"
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN bun install --production

# Copy rest of the app
COPY . .

EXPOSE 3000

CMD ["bun", "index.js"]
