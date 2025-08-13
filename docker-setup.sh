#!/bin/bash

# Open Lovable Docker Setup and Monitoring Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    print_status "Checking Docker installation and daemon status..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        echo "For Ubuntu/WSL: https://docs.docker.com/engine/install/ubuntu/"
        echo "For Docker Desktop: https://docs.docker.com/desktop/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running."
        echo "Solutions:"
        echo "1. Start Docker Desktop (if using Docker Desktop)"
        echo "2. Start Docker daemon: sudo systemctl start docker"
        echo "3. In WSL2, ensure Docker Desktop has WSL2 integration enabled"
        exit 1
    fi
    
    print_success "Docker is running"
}

# Function to check Docker Compose
check_docker_compose() {
    print_status "Checking Docker Compose..."
    
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available"
        exit 1
    fi
    
    print_success "Docker Compose is available"
}

# Function to create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    mkdir -p ./sandboxes
    mkdir -p ./data
    mkdir -p ./firecrawl-simple/apps/api/logs
    mkdir -p ./firecrawl-simple/apps/pydoll-service/logs
    
    print_success "Directories created"
}

# Function to create environment file if it doesn't exist
create_env_file() {
    print_status "Setting up environment variables..."
    
    if [ ! -f .env ]; then
        cat > .env << EOF
# Firecrawl Configuration
NUM_WORKERS_PER_QUEUE=8
BULL_AUTH_KEY=changeme-secure-key
TEST_API_KEY=test-key
LOGGING_LEVEL=info
MAX_RAM=0.95
MAX_CPU=0.95

# Optional: Scraping Bee API Key (for enhanced scraping)
# SCRAPING_BEE_API_KEY=your_key_here

# Optional: Proxy Configuration
# PROXY_SERVER=
# PROXY_USERNAME=
# PROXY_PASSWORD=

# Concurrency Settings
MAX_CONCURRENCY=10
EOF
        print_success "Created .env file with default values"
        print_warning "Please review and update .env file with your specific configuration"
    else
        print_status ".env file already exists"
    fi
}

# Function to build the services
build_services() {
    print_status "Building Docker services..."
    
    # Build with verbose output
    docker compose build --progress=plain
    
    if [ $? -eq 0 ]; then
        print_success "All services built successfully"
    else
        print_error "Build failed. Check the output above for details."
        exit 1
    fi
}

# Function to start the services
start_services() {
    print_status "Starting Docker services..."
    
    # Start services in detached mode
    docker compose up -d
    
    if [ $? -eq 0 ]; then
        print_success "All services started successfully"
        echo ""
        echo "Services are running on:"
        echo "  - Open Lovable App: http://localhost:3001"
        echo "  - Firecrawl API: http://localhost:3002"
        echo "  - Vite Dev Server: http://localhost:5173"
    else
        print_error "Failed to start services. Check the output above."
        exit 1
    fi
}

# Function to show service status
show_status() {
    print_status "Service Status:"
    docker compose ps
    echo ""
    
    print_status "Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
}

# Function to monitor logs
monitor_logs() {
    local service=${1:-""}
    
    if [ -z "$service" ]; then
        print_status "Following logs for all services (Ctrl+C to stop):"
        docker compose logs -f
    else
        print_status "Following logs for $service (Ctrl+C to stop):"
        docker compose logs -f "$service"
    fi
}

# Function to check service health
check_health() {
    print_status "Checking service health..."
    
    # Check Redis
    if docker compose exec -T firecrawl-redis redis-cli ping &> /dev/null; then
        print_success "Redis is healthy"
    else
        print_error "Redis health check failed"
    fi
    
    # Check main app (wait for it to be ready)
    print_status "Waiting for Open Lovable app to be ready..."
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3001 > /dev/null 2>&1; then
            print_success "Open Lovable app is responding"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Open Lovable app failed to start properly"
            return 1
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    # Check Firecrawl API
    print_status "Waiting for Firecrawl API to be ready..."
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3002/v1/health > /dev/null 2>&1; then
            print_success "Firecrawl API is responding"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Firecrawl API failed to start properly"
            return 1
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    print_success "All services are healthy!"
}

# Function to stop services
stop_services() {
    print_status "Stopping Docker services..."
    docker compose down
    print_success "Services stopped"
}

# Function to clean up everything
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker compose down -v --remove-orphans
    docker system prune -f
    print_success "Cleanup completed"
}

# Function to show help
show_help() {
    echo "Open Lovable Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  setup     - Initial setup (create dirs, env file)"
    echo "  build     - Build all Docker services"
    echo "  start     - Start all services"
    echo "  stop      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  status    - Show service status"
    echo "  logs      - Show logs for all services"
    echo "  logs <service> - Show logs for specific service"
    echo "  health    - Check service health"
    echo "  cleanup   - Stop services and clean up resources"
    echo "  full      - Full setup and start (setup + build + start + health)"
    echo "  help      - Show this help message"
    echo ""
    echo "Services available for logs:"
    echo "  - app (Open Lovable main application)"
    echo "  - firecrawl-api"
    echo "  - firecrawl-worker"
    echo "  - pydoll-service"
    echo "  - firecrawl-redis"
}

# Main script logic
case "${1:-help}" in
    "setup")
        check_docker
        check_docker_compose
        create_directories
        create_env_file
        ;;
    "build")
        check_docker
        check_docker_compose
        build_services
        ;;
    "start")
        check_docker
        check_docker_compose
        start_services
        ;;
    "stop")
        check_docker
        check_docker_compose
        stop_services
        ;;
    "restart")
        check_docker
        check_docker_compose
        stop_services
        start_services
        ;;
    "status")
        check_docker
        check_docker_compose
        show_status
        ;;
    "logs")
        check_docker
        check_docker_compose
        monitor_logs "$2"
        ;;
    "health")
        check_docker
        check_docker_compose
        check_health
        ;;
    "cleanup")
        check_docker
        check_docker_compose
        cleanup
        ;;
    "full")
        check_docker
        check_docker_compose
        create_directories
        create_env_file
        build_services
        start_services
        check_health
        show_status
        echo ""
        print_success "Full setup completed successfully!"
        echo ""
        echo "Next steps:"
        echo "1. Open http://localhost:3001 to access Open Lovable"
        echo "2. Use './docker-setup.sh logs' to monitor logs"
        echo "3. Use './docker-setup.sh status' to check service status"
        ;;
    "help"|*)
        show_help
        ;;
esac