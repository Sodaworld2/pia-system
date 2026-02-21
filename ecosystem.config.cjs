module.exports = {
  apps: [{
    name: 'pia-hub',
    script: 'src/index.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx/esm',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      // Explicitly unset Claude Code session vars — prevents "nested session" error
      // when PIA server is started from within a Claude Code session
      CLAUDECODE: '',
      CLAUDE_CODE_ENTRYPOINT: '',
      CLAUDE_CODE_SESSION: '',
      CLAUDE_CODE_OAUTH_TOKEN: '',
      CLAUDE_CODE_SESSION_ACCESS_TOKEN: '',
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
