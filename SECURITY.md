# Security Documentation

## Overview

This document outlines the security measures implemented in the Expense Tracker application, security best practices for deployment, and guidelines for maintaining a secure installation.

## Security Architecture

### Authentication & Authorization

#### JWT Token Security
- **Secure Generation**: JWT tokens are generated using a cryptographically secure secret (minimum 64 characters)
- **Expiration**: Tokens have a configurable expiration time (default: 7 days)
- **Validation**: Tokens are validated on every API request with user existence verification
- **Format Validation**: Token format is validated client-side to prevent malformed tokens

#### Password Security
- **Hashing**: Passwords are hashed using bcrypt with 12 salt rounds
- **Strength Requirements**: 
  - Minimum 8 characters
  - Must contain uppercase, lowercase, number, and special character
  - Maximum 128 characters to prevent DoS attacks
- **No Plain Text Storage**: Passwords are never stored in plain text

#### Session Management
- **Race Condition Prevention**: Async/await used in authentication middleware
- **User Verification**: Every request verifies user still exists in database
- **Token Payload Validation**: Token structure is validated before use

### Input Validation & Sanitization

#### Frontend Validation
- **Email Validation**: Strict regex pattern: `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`
- **Username Validation**: Alphanumeric with underscore/hyphen only: `/^[a-zA-Z0-9_-]+$/`
- **Length Limits**: All inputs have appropriate minimum and maximum length restrictions
- **XSS Prevention**: JSON parsing with structure validation and data sanitization

#### Backend Validation
- **Parameter Validation**: All API endpoints validate required parameters
- **Type Checking**: Input types are validated before processing
- **SQL Injection Prevention**: Parameterized queries used throughout
- **Rate Limiting**: Multiple levels of rate limiting implemented

### Cross-Site Scripting (XSS) Protection

#### Client-Side Protection
- **Safe JSON Parsing**: Custom `parseUserSafely()` function validates JSON structure
- **Token Format Validation**: JWT tokens validated before use
- **Color Sanitization**: CSS colors validated with regex before rendering
- **Input Sanitization**: User inputs trimmed and validated

#### Server-Side Protection
- **Helmet.js**: Security headers middleware implemented
- **Content Security Policy**: Configured in Nginx (when using provided config)
- **XSS Headers**: X-XSS-Protection header set to "1; mode=block"

### Cross-Site Request Forgery (CSRF) Protection

#### CORS Configuration
- **Origin Validation**: Dynamic origin validation based on environment
- **Credentials**: CORS credentials properly configured
- **Methods**: Limited to necessary HTTP methods only
- **Headers**: Restricted to required headers

#### Request Validation
- **Authorization Headers**: Proper Bearer token format validation
- **Referrer Policy**: Strict referrer policy implemented
- **SameSite Cookies**: When cookies are used (future enhancement)

### Rate Limiting

#### API Rate Limits
- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 requests per 15 minutes per IP
- **Nginx Level**: Additional rate limiting at reverse proxy level

#### Nginx Rate Limiting (when using provided config)
- **API Endpoints**: 10 requests per second with burst of 20
- **Auth Endpoints**: 1 request per second with burst of 3
- **General Traffic**: 30 requests per minute

### Database Security

#### SQLite Security
- **File Permissions**: Database file has restricted permissions (600)
- **Parameterized Queries**: All database queries use prepared statements
- **Connection Security**: Database connections properly managed
- **Backup Encryption**: Backups stored with appropriate permissions

#### Data Protection
- **User Isolation**: All queries filtered by user ID
- **Sensitive Data**: No sensitive data logged in plain text
- **Data Validation**: All data validated before database insertion

### Error Handling & Information Disclosure

#### Secure Error Messages
- **Generic Messages**: Production errors don't expose system details
- **Logging**: Detailed errors logged server-side only
- **Client Errors**: User-friendly messages without technical details
- **HTTP Status Codes**: Appropriate status codes without information leakage

#### Logging Security
- **No Sensitive Data**: Passwords, tokens never logged
- **Log Rotation**: Automated log rotation configured
- **Access Control**: Log files have restricted permissions

## Deployment Security

### Server Hardening

#### Ubuntu 22.04 Security
```bash
# System updates
sudo apt update && sudo apt upgrade -y

# Automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Fail2ban for intrusion detection
sudo apt install fail2ban
```

#### Firewall Configuration
```bash
# UFW configuration
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

#### SSH Security
```bash
# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Use key-based authentication
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Restart SSH
sudo systemctl restart ssh
```

### Nginx Security Configuration

#### Security Headers
```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

#### Content Security Policy
```nginx
add_header Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self';" always;
```

### SSL/TLS Configuration

#### Let's Encrypt Setup
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 2 * * * /usr/bin/certbot renew --quiet
```

#### SSL Security
- **TLS Version**: Only TLS 1.2 and 1.3 enabled
- **Cipher Suites**: Strong cipher suites configured
- **HSTS**: HTTP Strict Transport Security enabled
- **OCSP Stapling**: Enabled for performance and privacy

## Environment Security

### Environment Variables

#### Required Secure Configuration
```bash
# Strong JWT secret (minimum 64 characters)
JWT_SECRET="generate-a-very-long-random-string-at-least-64-characters"

# Production environment
NODE_ENV=production

# Allowed origins (production)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

#### Email Security
```bash
# Use app passwords for Gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=app-specific-password  # Not your regular password

# Secure SMTP configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

### File Permissions

#### Application Files
```bash
# Application directory
sudo chown -R appuser:appuser /opt/expense-tracker
sudo chmod -R 755 /opt/expense-tracker

# Environment file
sudo chmod 600 /opt/expense-tracker/server/.env
sudo chown appuser:appuser /opt/expense-tracker/server/.env

# Database file
sudo chmod 600 /opt/expense-tracker/server/expense_tracker.db
sudo chown appuser:appuser /opt/expense-tracker/server/expense_tracker.db
```

#### Script Permissions
```bash
# Backup script
sudo chmod +x /usr/local/bin/backup-expense-tracker.sh
sudo chown root:root /usr/local/bin/backup-expense-tracker.sh
```

## Monitoring & Maintenance

### Security Monitoring

#### Log Monitoring
```bash
# Monitor authentication attempts
sudo tail -f /var/log/expense-tracker/combined.log | grep "auth"

# Monitor failed requests
sudo tail -f /var/log/nginx/error.log

# Monitor system authentication
sudo tail -f /var/log/auth.log
```

#### System Monitoring
```bash
# Check running processes
ps aux | grep node

# Monitor network connections
sudo netstat -tulpn | grep :5000

# Check system resources
htop
```

### Regular Security Tasks

#### Weekly Tasks
- Review application logs for suspicious activity
- Check for failed authentication attempts
- Verify SSL certificate status
- Review firewall logs

#### Monthly Tasks
- Update system packages: `sudo apt update && sudo apt upgrade`
- Review user accounts and permissions
- Rotate application logs
- Test backup restoration process

#### Quarterly Tasks
- Security audit of dependencies: `npm audit`
- Review and update security policies
- Penetration testing (recommended)
- Update security documentation

### Backup Security

#### Backup Encryption
```bash
# Encrypt sensitive backups
gpg --symmetric --cipher-algo AES256 backup_file.db

# Secure backup directory
sudo chmod 700 /backup/expense-tracker
sudo chown -R backupuser:backupuser /backup/expense-tracker
```

#### Backup Verification
```bash
# Verify backup integrity
sqlite3 backup_file.db "PRAGMA integrity_check;"

# Test restoration process
cp backup_file.db test_restore.db
```

## Incident Response

### Security Incident Checklist

#### Immediate Response
1. **Identify** the nature and scope of the incident
2. **Contain** the threat (disable affected accounts, block IPs)
3. **Document** all actions taken
4. **Notify** relevant stakeholders

#### Investigation Steps
1. Review application and system logs
2. Check for unauthorized access or data modifications
3. Identify attack vectors and compromised data
4. Document findings and timeline

#### Recovery Steps
1. Patch vulnerabilities
2. Restore from clean backups if necessary
3. Reset passwords and regenerate tokens
4. Update security measures

#### Post-Incident
1. Conduct post-mortem analysis
2. Update security procedures
3. Implement additional safeguards
4. Train team on lessons learned

## Vulnerability Reporting

### Reporting Security Issues

If you discover a security vulnerability, please:

1. **Do not** create a public GitHub issue
2. **Do not** disclose the vulnerability publicly
3. **Send** a private email to the security team
4. **Include** detailed information about the vulnerability
5. **Wait** for acknowledgment before taking any further action

### Response Timeline

- **24 hours**: Acknowledgment of receipt
- **72 hours**: Initial assessment and severity rating
- **7 days**: Detailed investigation and proposed fix
- **30 days**: Security patch released (if applicable)

## Security Contact

For security-related questions or to report vulnerabilities:
- **Email**: security@yourcompany.com
- **PGP Key**: Available on request
- **Response Time**: Within 24 hours

## Compliance & Standards

This application implements security measures aligned with:
- **OWASP Top 10** vulnerabilities prevention
- **GDPR** privacy requirements (where applicable)
- **SOC 2** security standards
- **ISO 27001** information security management

## Security Checklist

### Pre-Deployment Checklist
- [ ] Strong JWT secret configured (64+ characters)
- [ ] Production CORS origins configured
- [ ] Database file permissions set (600)
- [ ] Environment file secured (.env with 600 permissions)
- [ ] HTTPS/SSL configured
- [ ] Security headers enabled
- [ ] Rate limiting configured
- [ ] Firewall configured (UFW)
- [ ] System updates applied
- [ ] Backup system configured
- [ ] Monitoring configured

### Post-Deployment Checklist
- [ ] SSL certificate auto-renewal working
- [ ] Application health monitoring active
- [ ] Log rotation configured
- [ ] Backup restoration tested
- [ ] Security headers verified (securityheaders.com)
- [ ] SSL configuration tested (ssllabs.com)
- [ ] Vulnerability scan completed
- [ ] Performance baseline established

### Monthly Security Review
- [ ] Review access logs for anomalies
- [ ] Check for security updates
- [ ] Verify backup integrity
- [ ] Review user accounts and permissions
- [ ] Test incident response procedures
- [ ] Update security documentation

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: $(date -d "+3 months")

This document should be reviewed and updated regularly to ensure it remains current with security best practices and threat landscape changes.