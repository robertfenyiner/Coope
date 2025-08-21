#!/bin/bash

# Expense Tracker Installation Script for Ubuntu 22.04
# This script automates the installation and configuration process
# Usage: sudo ./install-ubuntu-22.04.sh

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
LOG_FILE="/var/log/$APP_NAME-install.log"
DOMAIN=""
EMAIL=""
GIT_REPO=""

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

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Collect user inputs
collect_inputs() {
    log_step "Collecting configuration information..."
    
    echo "Please provide the following information:"
    
    while [ -z "$GIT_REPO" ]; do
        read -p "Git repository URL: " GIT_REPO
    done
    
    read -p "Domain name (optional, press enter to skip): " DOMAIN
    
    if [ -n "$DOMAIN" ]; then
        read -p "Email for SSL certificate (required for SSL): " EMAIL
    fi
    
    echo ""
    log_info "Configuration:"
    log_info "  - Git Repository: $GIT_REPO"
    log_info "  - Domain: ${DOMAIN:-'Not configured'}"
    log_info "  - Email: ${EMAIL:-'Not provided'}"
    echo ""
    
    read -p "Continue with installation? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
}

# Update system
update_system() {
    log_step "Updating system packages..."
    apt update
    apt upgrade -y
    apt install -y curl wget git unzip software-properties-common build-essential
}

# Install Node.js
install_nodejs() {
    log_step "Installing Node.js 18.x..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_info "Node.js already installed: $NODE_VERSION"
    else
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    fi
    
    # Update npm
    npm install -g npm@latest
    
    log_info "Node.js version: $(node --version)"
    log_info "NPM version: $(npm --version)"
}

# Install PM2
install_pm2() {
    log_step "Installing PM2..."
    
    if command -v pm2 &> /dev/null; then
        log_info "PM2 already installed: $(pm2 --version)"
    else
        npm install -g pm2
    fi
}

# Install Nginx
install_nginx() {
    log_step "Installing Nginx..."
    
    if systemctl is-active --quiet nginx; then
        log_info "Nginx already running"
    else
        apt install -y nginx
        systemctl start nginx
        systemctl enable nginx
    fi
    
    log_info "Nginx status: $(systemctl is-active nginx)"
}

# Install SSL tools
install_ssl_tools() {
    if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
        log_step "Installing SSL tools (Certbot)..."
        apt install -y certbot python3-certbot-nginx
    else
        log_warn "Skipping SSL tools - no domain configured"
    fi
}

# Configure firewall
configure_firewall() {
    log_step "Configuring firewall (UFW)..."
    
    # Enable UFW if not already enabled
    if ! ufw status | grep -q "Status: active"; then
        ufw default deny incoming
        ufw default allow outgoing
        ufw allow ssh
        ufw allow 'Nginx Full'
        ufw --force enable
    fi
    
    log_info "Firewall status:"
    ufw status numbered
}

# Clone and setup application
setup_application() {
    log_step "Setting up application..."
    
    # Create application directory
    mkdir -p "$APP_DIR"
    
    # Clone repository
    if [ -d "$APP_DIR/.git" ]; then
        log_info "Repository already exists, pulling latest changes..."
        cd "$APP_DIR"
        git pull origin main
    else
        log_info "Cloning repository..."
        git clone "$GIT_REPO" "$APP_DIR"
    fi
    
    # Set permissions
    chown -R $SUDO_USER:$SUDO_USER "$APP_DIR"
    
    cd "$APP_DIR"
    
    # Install server dependencies
    log_info "Installing server dependencies..."
    cd server
    sudo -u $SUDO_USER npm install --production
    
    # Install client dependencies and build
    log_info "Installing client dependencies and building..."
    cd ../client
    sudo -u $SUDO_USER npm install
    sudo -u $SUDO_USER npm run build
    
    # Verify build
    if [ ! -d "build" ]; then
        log_error "Client build failed - build directory not found"
        exit 1
    fi
    
    log_info "Application setup completed"
}

# Configure environment variables
configure_environment() {
    log_step "Configuring environment variables..."
    
    ENV_FILE="$APP_DIR/server/.env"
    
    if [ ! -f "$ENV_FILE" ]; then
        # Copy example file
        if [ -f "$APP_DIR/server/.env.example" ]; then
            cp "$APP_DIR/server/.env.example" "$ENV_FILE"
        else
            log_error ".env.example file not found"
            exit 1
        fi
        
        # Generate secure JWT secret
        JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
        
        # Update environment file
        sed -i "s/change-this-to-a-very-long-secure-secret-key-at-least-64-characters-long/$JWT_SECRET/" "$ENV_FILE"
        
        if [ -n "$DOMAIN" ]; then
            sed -i "s|APP_URL=http://localhost:3000|APP_URL=https://$DOMAIN|" "$ENV_FILE"
            sed -i "s|ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com|ALLOWED_ORIGINS=https://$DOMAIN,https://www.$DOMAIN|" "$ENV_FILE"
        fi
        
        # Set production environment
        sed -i "s/NODE_ENV=development/NODE_ENV=production/" "$ENV_FILE"
        
        # Set file permissions
        chmod 600 "$ENV_FILE"
        chown $SUDO_USER:$SUDO_USER "$ENV_FILE"
        
        log_info "Environment file configured"
        log_warn "Please review and update $ENV_FILE with your specific settings"
    else
        log_info "Environment file already exists"
    fi
}

# Setup logging directory
setup_logging() {
    log_step "Setting up logging directory..."
    
    LOG_DIR="/var/log/$APP_NAME"
    mkdir -p "$LOG_DIR"
    chown $SUDO_USER:$SUDO_USER "$LOG_DIR"
    chmod 755 "$LOG_DIR"
    
    # Setup log rotation
    cat > "/etc/logrotate.d/$APP_NAME" << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $SUDO_USER $SUDO_USER
    postrotate
        pm2 reload $APP_NAME-api 2>/dev/null || true
    endscript
}
EOF
}

# Configure PM2
configure_pm2() {
    log_step "Configuring PM2..."
    
    cd "$APP_DIR"
    
    # Start application with PM2
    sudo -u $SUDO_USER pm2 start ecosystem.config.js --env production
    
    # Save PM2 configuration
    sudo -u $SUDO_USER pm2 save
    
    # Setup PM2 startup
    PM2_STARTUP_CMD=$(sudo -u $SUDO_USER pm2 startup | tail -n 1)
    if [[ $PM2_STARTUP_CMD == sudo* ]]; then
        eval $PM2_STARTUP_CMD
    fi
    
    log_info "PM2 configured and application started"
}

# Configure Nginx
configure_nginx() {
    log_step "Configuring Nginx..."
    
    NGINX_CONFIG="/etc/nginx/sites-available/$APP_NAME"
    
    # Create Nginx configuration
    cat > "$NGINX_CONFIG" << EOF
server {
    listen 80;
    server_name ${DOMAIN:-localhost};
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Serve React static files
    location / {
        root $APP_DIR/client/build;
        index index.html;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Block sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
    
    location ~* \.(env|log|conf)$ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF

    # Enable site
    ln -sf "$NGINX_CONFIG" "/etc/nginx/sites-enabled/$APP_NAME"
    rm -f "/etc/nginx/sites-enabled/default"
    
    # Test configuration
    nginx -t
    
    # Reload Nginx
    systemctl reload nginx
    
    log_info "Nginx configured successfully"
}

# Configure SSL
configure_ssl() {
    if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
        log_step "Configuring SSL with Let's Encrypt..."
        
        # Obtain SSL certificate
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL"
        
        # Setup auto-renewal
        if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
            (crontab -l 2>/dev/null; echo "0 2 * * * /usr/bin/certbot renew --quiet") | crontab -
        fi
        
        log_info "SSL configured successfully"
    else
        log_warn "Skipping SSL configuration - no domain specified"
    fi
}

# Setup backup
setup_backup() {
    log_step "Setting up backup system..."
    
    BACKUP_SCRIPT_SRC="$APP_DIR/scripts/backup-expense-tracker.sh"
    BACKUP_SCRIPT_DEST="/usr/local/bin/backup-expense-tracker.sh"
    
    if [ -f "$BACKUP_SCRIPT_SRC" ]; then
        cp "$BACKUP_SCRIPT_SRC" "$BACKUP_SCRIPT_DEST"
        chmod +x "$BACKUP_SCRIPT_DEST"
        
        # Create backup directory
        mkdir -p "/backup/$APP_NAME"
        chown $SUDO_USER:$SUDO_USER "/backup/$APP_NAME"
        
        # Setup daily backup cron job
        if ! crontab -u $SUDO_USER -l 2>/dev/null | grep -q "backup-expense-tracker"; then
            (crontab -u $SUDO_USER -l 2>/dev/null; echo "0 2 * * * $BACKUP_SCRIPT_DEST >> /var/log/$APP_NAME/backup.log 2>&1") | crontab -u $SUDO_USER -
        fi
        
        log_info "Backup system configured"
    else
        log_warn "Backup script not found, skipping backup setup"
    fi
}

# Final verification
verify_installation() {
    log_step "Verifying installation..."
    
    # Check services
    if systemctl is-active --quiet nginx; then
        log_info "✓ Nginx is running"
    else
        log_error "✗ Nginx is not running"
    fi
    
    if sudo -u $SUDO_USER pm2 status | grep -q "$APP_NAME-api.*online"; then
        log_info "✓ Application is running"
    else
        log_error "✗ Application is not running"
    fi
    
    # Test API endpoint
    if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
        log_info "✓ API is responding"
    else
        log_warn "✗ API health check failed"
    fi
    
    # Check disk space
    AVAILABLE_SPACE=$(df /opt | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -gt 1048576 ]; then  # More than 1GB
        log_info "✓ Sufficient disk space available"
    else
        log_warn "⚠ Low disk space detected"
    fi
}

# Display final information
show_final_info() {
    log_step "Installation completed successfully!"
    
    echo ""
    log_info "Application Information:"
    log_info "  - Installation directory: $APP_DIR"
    log_info "  - Configuration file: $APP_DIR/server/.env"
    log_info "  - Log directory: /var/log/$APP_NAME"
    log_info "  - Backup directory: /backup/$APP_NAME"
    
    if [ -n "$DOMAIN" ]; then
        log_info "  - Website URL: https://$DOMAIN"
    else
        log_info "  - Website URL: http://$(hostname -I | awk '{print $1}')"
    fi
    
    echo ""
    log_info "Useful commands:"
    log_info "  - View application logs: pm2 logs $APP_NAME-api"
    log_info "  - Restart application: pm2 restart $APP_NAME-api"
    log_info "  - Check application status: pm2 status"
    log_info "  - View Nginx logs: tail -f /var/log/nginx/access.log"
    log_info "  - Run backup manually: /usr/local/bin/backup-expense-tracker.sh"
    
    echo ""
    log_warn "Next Steps:"
    log_warn "1. Review and update configuration: $APP_DIR/server/.env"
    log_warn "2. Configure email settings for notifications"
    log_warn "3. Set up monitoring (optional)"
    log_warn "4. Test the application thoroughly"
    
    if [ -z "$DOMAIN" ]; then
        log_warn "5. Configure domain and SSL for production use"
    fi
}

# Main installation function
main() {
    log_info "Starting Expense Tracker installation for Ubuntu 22.04"
    log_info "Installation started at: $(date)"
    
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    check_root
    collect_inputs
    update_system
    install_nodejs
    install_pm2
    install_nginx
    install_ssl_tools
    configure_firewall
    setup_application
    configure_environment
    setup_logging
    configure_pm2
    configure_nginx
    configure_ssl
    setup_backup
    verify_installation
    show_final_info
    
    log_info "Installation completed at: $(date)"
}

# Error handling
trap 'log_error "Installation failed on line $LINENO"; exit 1' ERR

# Execute main function
main "$@"