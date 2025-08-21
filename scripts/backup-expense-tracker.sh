#!/bin/bash

# Expense Tracker Backup Script
# This script creates backups of the database and configuration files
# Usage: ./backup-expense-tracker.sh

set -e  # Exit on error

# Configuration
BACKUP_DIR="/backup/expense-tracker"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH="/opt/expense-tracker/server/expense_tracker.db"
APP_DIR="/opt/expense-tracker"
LOG_FILE="/var/log/expense-tracker/backup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
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

# Create backup directory if it doesn't exist
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log_info "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Backup database
backup_database() {
    if [ -f "$DB_PATH" ]; then
        log_info "Backing up database..."
        cp "$DB_PATH" "$BACKUP_DIR/expense_tracker_$DATE.db"
        
        # Verify backup integrity
        if [ -f "$BACKUP_DIR/expense_tracker_$DATE.db" ]; then
            DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH")
            BACKUP_SIZE=$(stat -f%z "$BACKUP_DIR/expense_tracker_$DATE.db" 2>/dev/null || stat -c%s "$BACKUP_DIR/expense_tracker_$DATE.db")
            
            if [ "$DB_SIZE" -eq "$BACKUP_SIZE" ]; then
                log_info "Database backup completed successfully"
            else
                log_error "Database backup verification failed - size mismatch"
                exit 1
            fi
        else
            log_error "Database backup failed - file not created"
            exit 1
        fi
    else
        log_warn "Database file not found: $DB_PATH"
    fi
}

# Backup configuration files
backup_config() {
    log_info "Backing up configuration files..."
    
    CONFIG_BACKUP="$BACKUP_DIR/config_$DATE.tar.gz"
    
    # Create list of files to backup
    CONFIG_FILES=""
    
    # .env file (if exists)
    if [ -f "$APP_DIR/server/.env" ]; then
        CONFIG_FILES="$CONFIG_FILES server/.env"
    fi
    
    # ecosystem.config.js
    if [ -f "$APP_DIR/ecosystem.config.js" ]; then
        CONFIG_FILES="$CONFIG_FILES ecosystem.config.js"
    fi
    
    # package.json files
    if [ -f "$APP_DIR/package.json" ]; then
        CONFIG_FILES="$CONFIG_FILES package.json"
    fi
    
    if [ -f "$APP_DIR/server/package.json" ]; then
        CONFIG_FILES="$CONFIG_FILES server/package.json"
    fi
    
    # Nginx configuration (if exists)
    if [ -f "/etc/nginx/sites-available/expense-tracker" ]; then
        sudo cp "/etc/nginx/sites-available/expense-tracker" "$BACKUP_DIR/nginx_expense_tracker_$DATE.conf"
    fi
    
    # Create tar backup of config files
    if [ -n "$CONFIG_FILES" ]; then
        cd "$APP_DIR"
        tar -czf "$CONFIG_BACKUP" $CONFIG_FILES 2>/dev/null || log_warn "Some config files may be missing"
        log_info "Configuration backup completed"
    else
        log_warn "No configuration files found to backup"
    fi
}

# Create system info backup
backup_system_info() {
    log_info "Creating system information backup..."
    
    INFO_FILE="$BACKUP_DIR/system_info_$DATE.txt"
    
    {
        echo "# Expense Tracker System Information"
        echo "# Generated on: $(date)"
        echo "# Backup script version: 1.0"
        echo ""
        
        echo "## System Information"
        echo "Hostname: $(hostname)"
        echo "OS: $(uname -a)"
        echo "Disk Usage:"
        df -h
        echo ""
        
        echo "## Application Information"
        echo "Node.js version: $(node --version 2>/dev/null || echo 'Not installed')"
        echo "NPM version: $(npm --version 2>/dev/null || echo 'Not installed')"
        echo "PM2 status:"
        pm2 status 2>/dev/null || echo "PM2 not running"
        echo ""
        
        echo "## Service Status"
        echo "Nginx status:"
        systemctl status nginx --no-pager -l || echo "Nginx not running"
        echo ""
        
        echo "## Database Size"
        if [ -f "$DB_PATH" ]; then
            ls -lh "$DB_PATH"
        else
            echo "Database file not found"
        fi
        
    } > "$INFO_FILE"
    
    log_info "System information backup completed"
}

# Clean old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups (keeping last 30 days)..."
    
    # Remove database backups older than 30 days
    find "$BACKUP_DIR" -name "expense_tracker_*.db" -type f -mtime +30 -delete 2>/dev/null || true
    
    # Remove config backups older than 30 days
    find "$BACKUP_DIR" -name "config_*.tar.gz" -type f -mtime +30 -delete 2>/dev/null || true
    
    # Remove system info backups older than 30 days
    find "$BACKUP_DIR" -name "system_info_*.txt" -type f -mtime +30 -delete 2>/dev/null || true
    
    # Remove nginx config backups older than 30 days
    find "$BACKUP_DIR" -name "nginx_expense_tracker_*.conf" -type f -mtime +30 -delete 2>/dev/null || true
    
    log_info "Cleanup completed"
}

# Show backup statistics
show_backup_stats() {
    log_info "Backup Statistics:"
    
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "expense_tracker_*.db" -type f | wc -l)
    TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "Unknown")
    
    log_info "  - Total backups: $BACKUP_COUNT"
    log_info "  - Total backup size: $TOTAL_SIZE"
    log_info "  - Latest backup: $DATE"
}

# Test database integrity (optional)
test_database_integrity() {
    if command -v sqlite3 &> /dev/null; then
        log_info "Testing database integrity..."
        
        if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
            log_info "Database integrity check passed"
        else
            log_warn "Database integrity check failed - consider manual inspection"
        fi
    else
        log_warn "sqlite3 not available - skipping integrity check"
    fi
}

# Main execution
main() {
    log_info "Starting Expense Tracker backup process..."
    log_info "Backup date: $DATE"
    
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Check if running as correct user
    if [ "$EUID" -eq 0 ]; then
        log_warn "Running as root - consider running as application user"
    fi
    
    # Check available disk space
    AVAILABLE_SPACE=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 1048576 ]; then  # Less than 1GB
        log_warn "Low disk space detected - less than 1GB available"
    fi
    
    # Execute backup steps
    create_backup_dir
    test_database_integrity
    backup_database
    backup_config
    backup_system_info
    cleanup_old_backups
    show_backup_stats
    
    log_info "Backup process completed successfully!"
    log_info "Backup location: $BACKUP_DIR"
    
    # Send notification (optional)
    if command -v mail &> /dev/null && [ -n "$BACKUP_EMAIL" ]; then
        echo "Expense Tracker backup completed successfully on $(date)" | mail -s "Backup Success" "$BACKUP_EMAIL"
    fi
}

# Error handling
trap 'log_error "Backup failed with error on line $LINENO"; exit 1' ERR

# Execute main function
main "$@"