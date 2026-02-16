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

const ptyProcess = pty.spawn(shell, ['--verbose'], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: {
        ...process.env,
        CLAUDECODE: '',
        CLAUDE_CODE: '',
    },
});

console.log('Spawning claude with --verbose...');

log(`Spawned PID: ${ptyProcess.pid}`);

ptyProcess.onData((data) => {
    // Strip ANSI for easier reading in this debug script, or keep it to see raw
    console.log('RAW DATA:', JSON.stringify(data));
    const text = data.toString();
    if (text.includes('❯')) {
        console.log('PROMPT DETECTED');
    }

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
