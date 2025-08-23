module.exports = {
  apps: [
    {
      name: 'coopeenortol-server',
      script: './server/index.js',
      cwd: '/opt/coopeenortol',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'coopeenortol_db',
        DB_USER: 'coopeenortol_user',
        DB_PASSWORD: 'robert0217',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'robert0217',
        JWT_SECRET: 'f49ac18e618eed3585229729c034fbcc5458666ca559e7c5da3c3c6dc4bc0d33',
        JWT_EXPIRES_IN: '24h',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 587,
        SMTP_USER: 'robertfenyiner@hotmail.com',
        SMTP_PASS: 'tu_password_de_aplicacion',
        FROM_EMAIL: 'noreply@coopeenortol.com',
        FROM_NAME: 'Coopeenortol',
        UPLOAD_DIR: '/opt/coopeenortol/uploads',
        MAX_FILE_SIZE: 10485760,
        ALLOWED_EXTENSIONS: 'jpg,jpeg,png,pdf,doc,docx'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'coopeenortol_db',
        DB_USER: 'coopeenortol_user',
        DB_PASSWORD: 'robert0217',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'robert0217',
        JWT_SECRET: 'f49ac18e618eed3585229729c034fbcc5458666ca559e7c5da3c3c6dc4bc0d33',
        JWT_EXPIRES_IN: '24h',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 587,
        SMTP_USER: 'robertfenyiner@hotmail.com',
        SMTP_PASS: 'tu_password_de_aplicacion',
        FROM_EMAIL: 'noreply@coopeenortol.com',
        FROM_NAME: 'Coopeenortol',
        UPLOAD_DIR: '/opt/coopeenortol/uploads',
        MAX_FILE_SIZE: 10485760,
        ALLOWED_EXTENSIONS: 'jpg,jpeg,png,pdf,doc,docx'
      },
      error_file: '/opt/coopeenortol/logs/err.log',
      out_file: '/opt/coopeenortol/logs/out.log',
      log_file: '/opt/coopeenortol/logs/combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G'
    }
  ],
  deploy: {
    production: {
      user: 'nina',
      host: ['5.189.146.163'],
      ref: 'origin/main',
      repo: 'https://github.com/robertfenyiner/Coope.git',
      path: '/opt/coopeenortol',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && cd client && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};