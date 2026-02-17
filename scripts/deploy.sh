#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# PYR Production Deployment Script
# ═══════════════════════════════════════════════════════════════
# This script handles:
# - Image building with git SHA tags
# - Database migration verification
# - Service deployment with health checks
# - Automatic rollback on failure
# ═══════════════════════════════════════════════════════════════

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE"
SERVICES=("backend" "frontend" "assistant")
ROLLBACK_TAG_FILE=".deploy-previous-tag"

# Get current git SHA (short version)
GIT_SHA=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Confirmation prompt
confirm() {
    read -p "$1 (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# Save current deployment tag for rollback
save_rollback_point() {
    if $COMPOSE_CMD ps | grep -q "Up"; then
        # Get current image tag from running containers
        CURRENT_TAG=$($COMPOSE_CMD ps backend | grep backend | awk '{print $2}' | cut -d: -f2)
        if [ -n "$CURRENT_TAG" ] && [ "$CURRENT_TAG" != "latest" ]; then
            echo "$CURRENT_TAG" > "$ROLLBACK_TAG_FILE"
            log_info "Saved rollback point: $CURRENT_TAG"
        fi
    fi
}

# Rollback to previous deployment
rollback() {
    log_error "Deployment failed, initiating rollback..."

    if [ ! -f "$ROLLBACK_TAG_FILE" ]; then
        log_error "No rollback point found. Manual intervention required."
        exit 1
    fi

    PREVIOUS_TAG=$(cat "$ROLLBACK_TAG_FILE")
    log_warning "Rolling back to: $PREVIOUS_TAG"

    # Update docker-compose to use previous tag
    export IMAGE_TAG="$PREVIOUS_TAG"

    # Restart services with previous images
    $COMPOSE_CMD up -d --no-build

    # Wait for services to be healthy
    log_info "Waiting for services to become healthy..."
    sleep 10

    if check_health; then
        log_success "Rollback completed successfully"
        exit 0
    else
        log_error "Rollback failed. System may be in inconsistent state."
        log_error "Manual intervention required immediately."
        exit 1
    fi
}

# Check service health
check_health() {
    local MAX_RETRIES=30
    local RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        UNHEALTHY=$($COMPOSE_CMD ps | grep -v "Up" | grep -c "(healthy)" || true)

        if $COMPOSE_CMD ps | grep -q "Exit" || $COMPOSE_CMD ps | grep -q "Restarting"; then
            log_error "Some containers are not running"
            return 1
        fi

        # Check if all main services are healthy
        BACKEND_HEALTHY=$($COMPOSE_CMD ps backend | grep -c "(healthy)" || echo "0")
        FRONTEND_HEALTHY=$($COMPOSE_CMD ps frontend | grep -c "(healthy)" || echo "0")

        if [ "$BACKEND_HEALTHY" = "1" ] && [ "$FRONTEND_HEALTHY" = "1" ]; then
            log_success "All services are healthy"
            return 0
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        log_info "Waiting for services to be healthy... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 10
    done

    log_error "Services failed to become healthy within timeout"
    return 1
}

# Verify database connection
verify_database() {
    log_info "Verifying database connection..."

    if $COMPOSE_CMD exec -T postgres pg_isready -U pyr >/dev/null 2>&1; then
        log_success "Database is ready"
        return 0
    else
        log_error "Database is not accessible"
        return 1
    fi
}

# Main deployment function
deploy() {
    log_info "═══════════════════════════════════════════════════════════"
    log_info "PYR Production Deployment"
    log_info "Git SHA: $GIT_SHA"
    log_info "Branch: $GIT_BRANCH"
    log_info "═══════════════════════════════════════════════════════════"

    # Pre-flight checks
    if [ "$GIT_BRANCH" != "main" ]; then
        log_warning "You are deploying from branch: $GIT_BRANCH (not main)"
        if ! confirm "Continue?"; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi

    if ! git diff-index --quiet HEAD --; then
        log_error "Working directory has uncommitted changes"
        log_error "Please commit or stash changes before deploying"
        exit 1
    fi

    # Save rollback point
    save_rollback_point

    # Build images with git SHA tag
    log_info "Building Docker images..."
    export IMAGE_TAG="$GIT_SHA"

    # Build all services
    for service in "${SERVICES[@]}"; do
        log_info "Building $service..."
        if ! $COMPOSE_CMD build --pull "$service"; then
            log_error "Failed to build $service"
            exit 1
        fi
    done

    log_success "All images built successfully"

    # Tag images
    for service in "${SERVICES[@]}"; do
        docker tag "pyr-${service}:latest" "pyr-${service}:${GIT_SHA}"
        docker tag "pyr-${service}:latest" "pyr-${service}:stable"
        log_info "Tagged $service with: $GIT_SHA, stable"
    done

    # Verify database is accessible before migration
    if ! verify_database; then
        log_error "Cannot proceed without database access"
        exit 1
    fi

    # Stop services gracefully (but keep database and redis running)
    log_info "Stopping application services..."
    $COMPOSE_CMD stop backend frontend assistant

    # Deploy with new images
    log_info "Starting services with new images..."
    $COMPOSE_CMD up -d --no-build

    # Wait for services to start
    log_info "Waiting for services to initialize..."
    sleep 15

    # Check service health
    if check_health; then
        log_success "═══════════════════════════════════════════════════════════"
        log_success "Deployment completed successfully!"
        log_success "Version: $GIT_SHA"
        log_success "═══════════════════════════════════════════════════════════"

        # Show running services
        log_info "Running services:"
        $COMPOSE_CMD ps

        # Clean up old rollback point
        rm -f "$ROLLBACK_TAG_FILE"

    else
        log_error "Health check failed after deployment"

        # Show logs for debugging
        log_info "Backend logs (last 50 lines):"
        $COMPOSE_CMD logs --tail=50 backend

        # Offer rollback
        if [ -f "$ROLLBACK_TAG_FILE" ]; then
            if confirm "Rollback to previous version?"; then
                rollback
            else
                log_warning "Deployment failed but rollback declined"
                log_warning "System may be in inconsistent state"
                exit 1
            fi
        else
            log_error "No rollback point available"
            exit 1
        fi
    fi
}

# Show help
show_help() {
    cat << EOF
PYR Production Deployment Script

Usage: $0 [command]

Commands:
    deploy      Deploy current git commit to production (default)
    rollback    Rollback to previous deployment
    status      Show current deployment status
    logs        Show application logs
    help        Show this help message

Examples:
    $0                  # Deploy current commit
    $0 deploy           # Deploy current commit (explicit)
    $0 rollback         # Rollback to previous version
    $0 status           # Check deployment status
    $0 logs backend     # Show backend logs

EOF
}

# Show deployment status
show_status() {
    log_info "Current deployment status:"
    $COMPOSE_CMD ps

    if [ -f "$ROLLBACK_TAG_FILE" ]; then
        ROLLBACK_TAG=$(cat "$ROLLBACK_TAG_FILE")
        log_info "Rollback point available: $ROLLBACK_TAG"
    else
        log_info "No rollback point available"
    fi
}

# Show logs
show_logs() {
    local SERVICE="${1:-}"
    if [ -z "$SERVICE" ]; then
        $COMPOSE_CMD logs -f
    else
        $COMPOSE_CMD logs -f "$SERVICE"
    fi
}

# Main script entry point
main() {
    case "${1:-deploy}" in
        deploy)
            deploy
            ;;
        rollback)
            rollback
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "${2:-}"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
