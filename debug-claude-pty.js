import pty from 'node-pty';
import fs from 'fs';
import os from 'os';
import process from 'process';

const logFile = 'debug_pty_output.log';
const log = (msg) => fs.appendFileSync(logFile, msg + '\n');

fs.writeFileSync(logFile, 'Starting debug session...\n');

const isWin = os.platform() === 'win32';
const shell = 'cmd.exe';
const args = ['/c', 'claude', '--verbose'];

log(`Spawning: ${shell} ${args.join(' ')}`);

const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CLAUDECODE: '',
        CLAUDE_CODE: '',
    }
});

log(`Spawned PID: ${ptyProcess.pid}`);

ptyProcess.onData((data) => {
    log(`[DATA] ${JSON.stringify(data)}`);

    if (data.includes('Do you want to use this API key')) {
        log('[DETECTED] API Key Prompt');
        setTimeout(() => {
            log('[ACTION] Sending UP arrow');
            ptyProcess.write('\x1b[A');
            setTimeout(() => {
                log('[ACTION] Sending ENTER');
                ptyProcess.write('\r');
            }, 200);
        }, 500);
    }
});

ptyProcess.onExit(({ exitCode }) => {
    log(`[EXIT] Code: ${exitCode}`);
});

setTimeout(() => {
    log('Timeout reached, killing process');
    ptyProcess.kill();
    process.exit(0);
}, 30000);
