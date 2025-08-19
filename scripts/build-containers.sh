#!/bin/bash

# Build script for containerized sandbox architecture
set -e

echo "🏗️ Building Open Lovable with containerized sandboxes..."

# Build the sandbox service first
echo "📦 Building sandbox service container..."
docker build -t open-lovable-sandbox-service:latest ./services/sandbox-service

# Build the main app
echo "🚀 Building main application container..."
docker build -t open-lovable-app:latest .

# Start the services
echo "▶️ Starting containerized services..."
docker-compose up -d

echo "✅ Build complete!"
echo ""
echo "🌐 Services running:"
echo "  - Main app: http://localhost:3001"
echo "  - Sandbox service: http://localhost:3004"
echo "  - Firecrawl API: http://localhost:3002"
echo ""
echo "🔍 Check health:"
echo "  docker-compose ps"
echo "  curl http://localhost:3004/health"
echo ""
echo "📋 View logs:"
echo "  docker-compose logs -f sandbox-service"
echo "  docker-compose logs -f app"