FROM oraclelinux:9-slim

# Install build tools and Node.js 18 from NodeSource
RUN microdnf -y update || true \
 && microdnf -y install curl make gcc-c++ python3 tar gzip gnupg || true \
 && curl -fsSL https://rpm.nodesource.com/setup_18.x | bash - \
 && yum -y install nodejs || dnf -y install nodejs || microdnf -y install nodejs || true \
 && npm --version || true \
 && yum clean all || true

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production || true

# Copy rest of the app
COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
