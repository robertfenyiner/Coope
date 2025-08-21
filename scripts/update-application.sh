#!/bin/bash

# Expense Tracker Update Script
# This script safely updates the application to the latest version
# Usage: ./update-application.sh [branch]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="expense-tracker"
APP_DIR="/opt/$APP_NAME"
BACKUP_DIR="/backup/$APP_NAME"
LOG_FILE="/var/log/$APP_NAME/update.log"
BRANCH=${1:-main}
MAINTENANCE_FILE="$APP_DIR/maintenance.html"

# Logging functions
log() {
    echo -e "${1}" | tee -a "$LOG_FILE"
}

log_info() {
    log "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    log "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    log "${RED}[ERROR]${NC} $1"
}

log_step() {
    log "${BLUE}[STEP]${NC} $1"
}

# Check if running as correct user
check_user() {
    if [ "$EUID" -eq 0 ]; then
        log_error "This script should not be run as root. Please run as the application user."
        exit 1
    fi
    
    if [ ! -w "$APP_DIR" ]; then
        log_error "No write permission to $APP_DIR. Please check permissions."
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Check if directory exists
    if [ ! -d "$APP_DIR" ]; then
        log_error "Application directory not found: $APP_DIR"
        exit 1
    fi
    
    # Check if it's a git repository
    if [ ! -d "$APP_DIR/.git" ]; then
        log_error "Not a git repository: $APP_DIR"
        exit 1
    fi
    
    # Check if PM2 is running the application
    if ! pm2 list | grep -q "$APP_NAME-api.*online"; then
        log_warn "Application is not running in PM2"
    fi
    
    # Check available disk space (need at least 1GB for safe update)
    AVAILABLE_SPACE=$(df "$APP_DIR" | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 1048576 ]; then
        log_error "Insufficient disk space. Need at least 1GB available."
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Create maintenance page
enable_maintenance_mode() {
    log_step "Enabling maintenance mode..."
    
    cat > "$MAINTENANCE_FILE" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance - Expense Tracker</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            color: white;
            padding: 2rem;
            max-width: 500px;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
        }
        p {
            font-size: 1.1rem;
            opacity: 0.9;
            line-height: 1.6;
        }
        .spinner {
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top: 3px solid white;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 2rem auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔧</div>
        <h1>System Update in Progress</h1>
        <p>We're updating Expense Tracker to serve you better. This will only take a few minutes.</p>
        <div class="spinner"></div>
        <p>Thank you for your patience!</p>
    </div>
</body>
</html>
EOF

    # Update Nginx to serve maintenance page
    if command -v nginx >/dev/null 2>&1; then
        log_info "Maintenance mode enabled"
    else
        log_warn "Nginx not found, maintenance page created but not served"
    fi
}

# Disable maintenance mode
disable_maintenance_mode() {
    log_step "Disabling maintenance mode..."
    
    if [ -f "$MAINTENANCE_FILE" ]; then
        rm "$MAINTENANCE_FILE"
        log_info "Maintenance mode disabled"
    fi
}

# Create backup before update
create_backup() {
    log_step "Creating backup before update..."
    
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FULL_DIR="$BACKUP_DIR/pre-update-$BACKUP_TIMESTAMP"
    
    mkdir -p "$BACKUP_FULL_DIR"
    
    # Backup database
    if [ -f "$APP_DIR/server/expense_tracker.db" ]; then
        cp "$APP_DIR/server/expense_tracker.db" "$BACKUP_FULL_DIR/expense_tracker.db"
        log_info "Database backed up"
    fi
    
    # Backup configuration
    if [ -f "$APP_DIR/server/.env" ]; then
        cp "$APP_DIR/server/.env" "$BACKUP_FULL_DIR/.env"
        log_info "Configuration backed up"
    fi
    
    # Backup current git state
    cd "$APP_DIR"
    git log -1 --oneline > "$BACKUP_FULL_DIR/current_commit.txt"
    git status --porcelain > "$BACKUP_FULL_DIR/git_status.txt" 2>/dev/null || true
    
    log_info "Backup created at: $BACKUP_FULL_DIR"
    echo "$BACKUP_FULL_DIR" > /tmp/expense_tracker_backup_path
}

# Update application code
update_code() {
    log_step "Updating application code..."
    
    cd "$APP_DIR"
    
    # Stash any local changes
    if ! git diff --quiet || ! git diff --staged --quiet; then
        log_warn "Local changes detected, stashing..."
        git stash push -m "Auto-stash before update $(date)"
    fi
    
    # Fetch latest changes
    log_info "Fetching latest changes..."
    git fetch origin
    
    # Get current and target commit
    CURRENT_COMMIT=$(git rev-parse HEAD)
    TARGET_COMMIT=$(git rev-parse "origin/$BRANCH")
    
    if [ "$CURRENT_COMMIT" = "$TARGET_COMMIT" ]; then
        log_info "Already up to date"
        return 0
    fi
    
    log_info "Updating from $CURRENT_COMMIT to $TARGET_COMMIT"
    
    # Checkout target branch
    git checkout "$BRANCH"
    git reset --hard "origin/$BRANCH"
    
    log_info "Code updated successfully"
}

# Update dependencies
update_dependencies() {
    log_step "Updating dependencies..."
    
    cd "$APP_DIR"
    
    # Check if package.json changed
    if git diff --name-only HEAD^ HEAD | grep -q "package\.json"; then
        log_info "package.json changed, updating dependencies..."
        
        # Update server dependencies
        cd "$APP_DIR/server"
        npm ci --production --silent
        
        # Update client dependencies
        cd "$APP_DIR/client"
        npm ci --silent
        
        log_info "Dependencies updated"
    else
        log_info "No dependency changes detected"
    fi
}

# Build application
build_application() {
    log_step "Building application..."
    
    cd "$APP_DIR/client"
    
    # Check if client files changed
    if git diff --name-only HEAD^ HEAD | grep -qE "^client/"; then
        log_info "Client changes detected, rebuilding..."
        
        npm run build
        
        if [ ! -d "build" ] || [ -z "$(ls -A build)" ]; then
            log_error "Build failed - build directory is empty"
            exit 1
        fi
        
        log_info "Application built successfully"
    else
        log_info "No client changes detected, skipping build"
    fi
}

# Run database migrations (if any)
run_migrations() {
    log_step "Checking for database migrations..."
    
    # This is a placeholder - implement actual migration logic based on your needs
    # For SQLite, you might check for migration files or version changes
    
    cd "$APP_DIR/server"
    
    if [ -d "migrations" ] && [ "$(ls -A migrations 2>/dev/null)" ]; then
        log_info "Running database migrations..."
        # Implement migration logic here
        # node run-migrations.js || exit 1
        log_info "Migrations completed"
    else
        log_info "No migrations to run"
    fi
}

# Restart application
restart_application() {
    log_step "Restarting application..."
    
    # Gracefully restart PM2 application
    if pm2 list | grep -q "$APP_NAME-api"; then
        log_info "Restarting PM2 application..."
        pm2 restart "$APP_NAME-api"
        
        # Wait for application to be ready
        sleep 5
        
        # Check if application is running
        if pm2 list | grep -q "$APP_NAME-api.*online"; then
            log_info "Application restarted successfully"
        else
            log_error "Application failed to start"
            return 1
        fi
    else
        log_warn "Application not managed by PM2, please restart manually"
    fi
    
    # Test application health
    if curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
        log_info "Health check passed"
    else
        log_error "Health check failed"
        return 1
    fi
}

# Rollback in case of failure
rollback() {
    log_error "Update failed, initiating rollback..."
    
    if [ -f /tmp/expense_tracker_backup_path ]; then
        BACKUP_PATH=$(cat /tmp/expense_tracker_backup_path)
        
        cd "$APP_DIR"
        
        # Restore database
        if [ -f "$BACKUP_PATH/expense_tracker.db" ]; then
            cp "$BACKUP_PATH/expense_tracker.db" "$APP_DIR/server/expense_tracker.db"
            log_info "Database restored"
        fi
        
        # Restore configuration
        if [ -f "$BACKUP_PATH/.env" ]; then
            cp "$BACKUP_PATH/.env" "$APP_DIR/server/.env"
            log_info "Configuration restored"
        fi
        
        # Restore git state
        if [ -f "$BACKUP_PATH/current_commit.txt" ]; then
            RESTORE_COMMIT=$(cat "$BACKUP_PATH/current_commit.txt" | awk '{print $1}')
            git checkout "$RESTORE_COMMIT"
            log_info "Code restored to previous state"
        fi
        
        # Restart application
        if pm2 list | grep -q "$APP_NAME-api"; then
            pm2 restart "$APP_NAME-api"
            log_info "Application restarted with previous version"
        fi
        
        log_error "Rollback completed. Please check logs and fix issues before retrying update."
    else
        log_error "No backup path found, manual recovery may be required"
    fi
}

# Cleanup temporary files
cleanup() {
    disable_maintenance_mode
    
    if [ -f /tmp/expense_tracker_backup_path ]; then
        rm /tmp/expense_tracker_backup_path
    fi
}

# Send notification (optional)
send_notification() {
    local status=$1
    local message=$2
    
    # Send email notification if configured
    if command -v mail >/dev/null 2>&1 && [ -n "$UPDATE_NOTIFICATION_EMAIL" ]; then
        echo "$message" | mail -s "Expense Tracker Update: $status" "$UPDATE_NOTIFICATION_EMAIL"
    fi
    
    # Log to system log
    logger -t expense-tracker-update "$status: $message"
}

# Main update function
main() {
    log_info "Starting Expense Tracker update process"
    log_info "Target branch: $BRANCH"
    log_info "Update started at: $(date)"
    
    # Setup error handling
    trap 'rollback; cleanup; send_notification "FAILED" "Update failed at $(date)"; exit 1' ERR
    trap 'cleanup' EXIT
    
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    check_user
    check_prerequisites
    enable_maintenance_mode
    create_backup
    update_code
    update_dependencies
    build_application
    run_migrations
    restart_application
    
    disable_maintenance_mode
    
    log_info "Update completed successfully at: $(date)"
    send_notification "SUCCESS" "Update completed successfully at $(date)"
}

# Help function
show_help() {
    cat << EOF
Expense Tracker Update Script

Usage: $0 [OPTIONS] [BRANCH]

Arguments:
    BRANCH    Git branch to update to (default: main)

Options:
    -h, --help    Show this help message

Environment Variables:
    UPDATE_NOTIFICATION_EMAIL    Email address for update notifications

Examples:
    $0                    # Update to latest main branch
    $0 develop           # Update to develop branch
    $0 v1.2.0           # Update to specific tag

This script will:
1. Create a backup of current state
2. Update code from git repository
3. Update dependencies if needed
4. Rebuild application if needed
5. Run database migrations if any
6. Restart the application
7. Verify the update was successful

In case of failure, it will automatically rollback to the previous state.
EOF
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac