module.exports = {
  apps: [{
    name: 'gastos-robert-api',
    script: './server/index.js',
    cwd: process.cwd() || '/home/ubuntu/gastos',
    instances: 1, // Change to 'max' for production with multiple CPU cores
    exec_mode: 'fork', // Use 'cluster' with multiple instances
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    // Logging configuration
    error_file: '/var/log/gastos-robert/error.log',
    out_file: '/var/log/gastos-robert/access.log',
    log_file: '/var/log/gastos-robert/combined.log',
    time: true,
    
    // Memory and restart configuration
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512',
    
    // Restart configuration
    watch: false, // Set to true for development, false for production
    ignore_watch: [
      'node_modules',
      'logs',
      '*.log',
      'expense_tracker.db',
      'client/build'
    ],
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Auto restart on file changes (development only)
    watch_delay: 1000,
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Health monitoring
    health_check_grace_period: 3000,
    
    // Cron restart (optional - restart daily at 3 AM)
    cron_restart: '0 3 * * *',
    
    // Merge logs from all instances
    merge_logs: true,
    
    // Source map support
    source_map_support: true,
    
    // Instance variables
    instance_var: 'INSTANCE_ID'
  }],

  deploy: {
    production: {
      user: 'ubuntu',
    host: ['5.189.146.163'],
      ref: 'origin/main',
      repo: 'https://github.com/robertfenyiner/gastos.git',
      path: '/home/ubuntu/gastos',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && cd client && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};