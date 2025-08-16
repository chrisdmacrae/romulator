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
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

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
    && adduser -S romulator -u 1001

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Skip Playwright browser installation since we're using system Chromium
# RUN npx playwright install --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Create directories and set permissions
RUN mkdir -p /app/downloads /app/config /app/organized

# Set ownership of app directory and create entrypoint script
RUN chown -R romulator:nodejs /app

# Create entrypoint script to handle dynamic user IDs
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'if [ -n "$PUID" ] && [ -n "$PGID" ]; then' >> /entrypoint.sh && \
    echo '  echo "Setting user ID to $PUID:$PGID"' >> /entrypoint.sh && \
    echo '  usermod -u $PUID romulator 2>/dev/null || true' >> /entrypoint.sh && \
    echo '  groupmod -g $PGID nodejs 2>/dev/null || true' >> /entrypoint.sh && \
    echo '  chown -R $PUID:$PGID /app/downloads /app/config /app/organized 2>/dev/null || true' >> /entrypoint.sh && \
    echo 'fi' >> /entrypoint.sh && \
    echo 'exec "$@"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh
# Create default config file
RUN touch /app/config/rulesets.yaml && \
    chown -R romulator:nodejs /app

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/rulesets', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use entrypoint script to handle dynamic user IDs
ENTRYPOINT ["/entrypoint.sh"]

# Start the application
CMD ["node", "src/server.js"]
