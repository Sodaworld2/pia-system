module.exports = {
  apps: [{
    name: 'pia-hub',
    script: 'src/index.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx/esm',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
    },
    watch: false,
    autorestart: true,
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '10s',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    out_file: './logs/pia-hub-out.log',
    error_file: './logs/pia-hub-err.log',
    merge_logs: true
  }]
};
