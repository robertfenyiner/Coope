module.exports = {
  apps: [{
    name: 'gastos-robert-api',
    script: './server/index.js',
    cwd: process.cwd() || '/home/nina/gastos-robert',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    // Logging configuration
    error_file: '/var/log/gastos-robert/error.log',
    out_file: '/var/log/gastos-robert/access.log',
    log_file: '/var/log/gastos-robert/combined.log',
    time: true,
    
    // Memory and restart configuration - Aumentado para evitar reinicios
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Restart configuration - Configuración más estable
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      '*.log',
      'gastos_robert.db',
      'client/build',
      'reports',
      'backups'
    ],
    restart_delay: 10000,
    max_restarts: 5,
    min_uptime: '30s',
    
    // Auto restart on file changes (development only)
    watch_delay: 1000,
    
    // Graceful shutdown - Más tiempo para cierre limpio
    kill_timeout: 10000,
    wait_ready: false,
    listen_timeout: 15000,
    
    // Health monitoring
    health_check_grace_period: 5000,
    
    // NO cron restart automático - esto podría ser el problema
    // cron_restart: '0 3 * * *',
    
    // Merge logs from all instances
    merge_logs: true,
    
    // Source map support
    source_map_support: true,
    
    // Instance variables
    instance_var: 'INSTANCE_ID',
    
    // Evitar reinicios frecuentes
    exponential_backoff_restart_delay: 100,
    
    // Autorestart solo en errores críticos
    autorestart: true,
    
    // Variables de entorno adicionales para estabilidad
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
      JWT_EXPIRES_IN: '7d',
      UV_THREADPOOL_SIZE: 16
    }
  }],

  deploy: {
    production: {
      user: 'nina',
      host: ['5.189.146.163'],
      ref: 'origin/main',
      repo: 'https://github.com/robertfenyiner/gastos.git',
      path: '/home/nina/gastos-robert',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && cd client && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};