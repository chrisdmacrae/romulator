#!/bin/bash

# Setup script for ROM Downloader Docker permissions
# This script ensures the mounted directories have the correct permissions

set -e

echo "🔧 Setting up ROM Downloader directory permissions..."

# Get current user ID and group ID
USER_ID=$(id -u)
GROUP_ID=$(id -g)

echo "📋 Current user: $USER_ID:$GROUP_ID"

# Create directories if they don't exist
echo "📁 Creating directories..."
mkdir -p downloads config organized

# Set ownership to current user
echo "🔐 Setting ownership to $USER_ID:$GROUP_ID..."
sudo chown -R $USER_ID:$GROUP_ID downloads config organized

# Set permissions
echo "📝 Setting permissions..."
chmod -R 755 downloads config organized

# Create default config file if it doesn't exist
if [ ! -f config/rulesets.yaml ]; then
    echo "📄 Creating default rulesets.yaml..."
    cat > config/rulesets.yaml << 'EOF'
# ROM Organization Rulesets
# Add your custom rulesets here
rulesets: []
EOF
    chown $USER_ID:$GROUP_ID config/rulesets.yaml
fi

echo "✅ Directory permissions setup complete!"
echo ""
echo "📋 Directory structure:"
ls -la downloads config organized
echo ""
echo "🚀 You can now run: docker-compose up -d"
