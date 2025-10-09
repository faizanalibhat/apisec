FROM node:18-alpine

RUN apk add --no-cache python3 make g++
# Install PM2 globally
RUN npm install pm2 -g
# Create app directory
WORKDIR /app

# Copy ecosystem file first (explicit)
COPY ecosystem.config.js .

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Now copy everything else
COPY . .

# Create a directory for keys
RUN mkdir -p keys

# Start command
CMD ["pm2-runtime", "ecosystem.config.mjs"]
