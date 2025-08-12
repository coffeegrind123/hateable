#!/bin/bash

# Open Lovable Self-Hosted Setup Script

set -e

echo "🚀 Setting up Open Lovable (Self-Hosted)"
echo "========================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Create environment file if it doesn't exist
if [ ! -f .env.local ]; then
    echo "📝 Creating environment configuration..."
    cp .env.example .env.local
    echo "✅ Created .env.local from template"
    echo "ℹ️  You can edit .env.local if needed, but LLM endpoints are configured in the web interface"
else
    echo "✅ Environment file .env.local already exists"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p sandboxes
mkdir -p data
echo "✅ Created sandboxes and data directories"

# Install Playwright browsers (for local development)
if [ "$1" == "--dev" ]; then
    echo "🎭 Installing Playwright browsers for development..."
    if command -v npm &> /dev/null; then
        npx playwright install
        echo "✅ Playwright browsers installed"
    else
        echo "⚠️  npm not found. Playwright browsers will be installed in Docker container."
    fi
fi

# Build and start the services
echo "🐳 Building and starting Docker services..."
if command -v docker-compose &> /dev/null; then
    docker-compose up --build -d
else
    docker compose up --build -d
fi

echo ""
echo "🎉 Open Lovable is now running!"
echo ""
echo "📱 Access the application:"
echo "   → Web Interface: http://localhost:3000"
echo ""
echo "🔧 Configuration:"
echo "   → Configure your LLM endpoint in the web interface"
echo "   → Supported: OpenAI-compatible APIs (Ollama, LocalAI, etc.)"
echo ""
echo "📁 Data Storage:"
echo "   → Sandboxes: ./sandboxes"
echo "   → Application data: ./data"
echo ""
echo "🛠️  Useful commands:"
echo "   → View logs: docker-compose logs -f"
echo "   → Stop services: docker-compose down"
echo "   → Update: git pull && docker-compose up --build -d"
echo ""
echo "Need help? Check the README.md file or visit:"
echo "https://github.com/pump-bear/open-lovable2"