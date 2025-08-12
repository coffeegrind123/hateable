#!/bin/bash

# Open Lovable Health Check Script

echo "🏥 Open Lovable Health Check"
echo "============================"

# Check if the application is running
echo "🔍 Checking application status..."

# Check main app
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Main application is running on port 3000"
else
    echo "❌ Main application is not responding on port 3000"
fi

# Check if Docker containers are running (if using Docker)
if command -v docker &> /dev/null; then
    if docker ps | grep -q "open-lovable"; then
        echo "✅ Docker containers are running"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep "open-lovable"
    else
        echo "ℹ️  No Docker containers found (may be running in development mode)"
    fi
fi

# Check directory structure
echo ""
echo "📁 Checking directory structure..."

if [ -d "sandboxes" ]; then
    echo "✅ Sandboxes directory exists"
    sandbox_count=$(find sandboxes -maxdepth 1 -type d | wc -l)
    echo "   └── $((sandbox_count - 1)) sandbox(s) found"
else
    echo "⚠️  Sandboxes directory not found"
fi

if [ -d "data" ]; then
    echo "✅ Data directory exists"
else
    echo "⚠️  Data directory not found"
fi

# Check configuration
echo ""
echo "⚙️  Checking configuration..."

if [ -f ".env.local" ]; then
    echo "✅ Environment file exists (.env.local)"
else
    echo "ℹ️  No .env.local file (configuration done in web interface)"
fi

if [ -f "docker-compose.yml" ]; then
    echo "✅ Docker Compose configuration exists"
else
    echo "❌ Docker Compose configuration not found"
fi

# Check dependencies
echo ""
echo "📦 Checking dependencies..."

if [ -d "node_modules" ]; then
    echo "✅ Node modules installed"
else
    echo "❌ Node modules not found - run 'npm install'"
fi

# Check for Playwright
if [ -d "node_modules/playwright" ]; then
    echo "✅ Playwright installed"
else
    echo "❌ Playwright not found - run 'npm install'"
fi

# Test API endpoints
echo ""
echo "🔌 Testing API endpoints..."

endpoints=(
    "/api/create-local-sandbox"
    "/api/scrape-url-playwright"
    "/api/scrape-screenshot-playwright"
)

for endpoint in "${endpoints[@]}"; do
    if curl -s "http://localhost:3000$endpoint" > /dev/null 2>&1; then
        echo "✅ $endpoint is accessible"
    else
        echo "❌ $endpoint is not responding"
    fi
done

echo ""
echo "📊 Health Check Complete!"
echo ""
echo "🚀 If all checks pass, your Open Lovable instance is ready!"
echo "🌐 Access it at: http://localhost:3000"