# Multi-stage build for ROM Downloader
FROM node:20-alpine AS builder

# Install dependencies needed for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Playwright to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the React frontend
RUN npm run client:build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

# Set Playwright to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
RUN mkdir -p /app/downloads /app/config /app/organized
RUN chown -R nextjs:nodejs /app/downloads /app/config /app/organized
RUN touch /app/config/rulesets.yaml
RUN chown -R nextjs:nodejs /app/config/rulesets.yaml

# Create directories for volumes
RUN mkdir -p /app/downloads /app/config /app/organized \
    && chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/rulesets', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "src/server.js"]
