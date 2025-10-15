FROM node:18-alpine

RUN apk add --no-cache python3 make g++
# Install PM2 globally
RUN npm install pm2 -g
# Create app directory
WORKDIR /app

# Copy ecosystem file first (explicit)
COPY ecosystem.config.cjs .

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Now copy everything else
COPY . .

# Create a directory for keys
RUN mkdir -p keys

RUN chmod +x /app/launch.sh

CMD ["/app/launch.sh"]
# Start command
# CMD ["pm2-runtime", "ecosystem.config.cjs"]
