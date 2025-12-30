FROM mcr.microsoft.com/playwright:v1.42.0-jammy

# Install build tools (Ubuntu-based image → use apt)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
 && rm -rf /var/lib/apt/lists/*

# Install pm2 globally
RUN npm install -g pm2

WORKDIR /app

# Copy ecosystem file first (better cache usage)
COPY ecosystem.config.cjs .

# Copy package files
COPY package*.json ./

# Install node dependencies
RUN npm install

# Copy rest of the app
COPY . .

# Create directory for keys
RUN mkdir -p keys

ENV NODE_ENV=production

# Start with PM2
CMD ["pm2-runtime", "ecosystem.config.cjs"]
