const { execSync } = require('child_process');
const fs = require('fs');
const name = process.argv[2] || 'screen';
const outDir = 'C:/Users/User/Documents/GitHub/pia-system/public/screenshots';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = name + '-' + ts + '.png';
const psScript = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
  '$b = New-Object System.Drawing.Bitmap($s.Width, $s.Height)',
  '$g = [System.Drawing.Graphics]::FromImage($b)',
  '$g.CopyFromScreen($s.Location, [System.Drawing.Point]::Empty, $s.Size)',
  '$b.Save("' + outDir + '/' + filename + '")',
  '$g.Dispose()',
  '$b.Dispose()',
].join('\n');
const tmpPs = 'C:/Users/User/Documents/GitHub/pia-system/public/_tmp_ss.ps1';
fs.writeFileSync(tmpPs, psScript);
try {
  execSync('powershell -ExecutionPolicy Bypass -File "' + tmpPs + '"', { timeout: 10000 });
  console.log('OK:screenshots/' + filename);
} catch(e) {
  console.log('FAIL:' + e.message);
}
