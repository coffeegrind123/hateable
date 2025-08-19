#!/bin/bash

# Open Hateable Production Build Script
set -e

echo "🚀 Starting Open Hateable Production Build..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Installing latest pnpm..."
    corepack install -g pnpm@latest
fi

# Verify pnpm version
PNPM_VERSION=$(pnpm --version)
echo "✅ Using pnpm version: $PNPM_VERSION"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
pnpm run clean

# Install dependencies with build scripts enabled
echo "📦 Installing dependencies with build scripts..."
pnpm install --frozen-lockfile --prod=false --ignore-scripts=false

# Approve build scripts for essential dependencies if needed
echo "✅ Approving build scripts for essential dependencies..."
pnpm config set ignore-scripts false || true

# Type checking
echo "🔍 Running type checks..."
pnpm run type-check

# Linting
echo "🧹 Running linting..."
pnpm run lint

# Build the application
echo "🔨 Building production application..."
pnpm run build:prod

# Build Docker images
echo "🐳 Building Docker images..."
docker build -t open-hateable:latest .
docker build --target runner -t open-hateable:prod .

echo "✅ Production build complete!"
echo "🚀 To run: docker-compose -f docker-compose.prod.yml up -d"
echo "📊 To analyze bundle: pnpm run build:analyze"