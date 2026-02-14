"""Remote Windows MCP client for Machine #3"""
import urllib.request
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MCP_URL = os.environ.get('MCP_URL', 'http://100.102.217.69:8765/mcp')
session_id = None

def mcp_call(msg):
    global session_id
    data = json.dumps(msg).encode()
    headers = {'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
    if session_id:
        headers['mcp-session-id'] = session_id
    req = urllib.request.Request(MCP_URL, data=data, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        sid = resp.headers.get('mcp-session-id')
        if sid: session_id = sid
        body = resp.read().decode('utf-8')
        for line in body.split('\n'):
            if line.startswith('data:'):
                return json.loads(line[6:].strip())
        if body.strip(): return json.loads(body)
    except urllib.error.HTTPError as e:
        return None
    return None

def init():
    global session_id
    r = mcp_call({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'pia','version':'1.0'}}})
    mcp_call({'jsonrpc':'2.0','method':'notifications/initialized'})
    return session_id

def call_tool(name, args, call_id=2):
    r = mcp_call({'jsonrpc':'2.0','id':call_id,'method':'tools/call','params':{'name':name,'arguments':args}})
    if r and 'result' in r:
        texts = []
        for c in r['result'].get('content',[]):
            texts.append(c.get('text',''))
        return '\n'.join(texts)
    return json.dumps(r) if r else 'No response'

def snapshot(use_vision=False):
    return call_tool('Snapshot', {'use_vision': use_vision})

def click(x, y, clicks=1, button='left'):
    return call_tool('Click', {'loc': [x, y], 'clicks': clicks, 'button': button})

def type_text(x, y, text, clear=False, press_enter=False):
    return call_tool('Type', {'loc': [x, y], 'text': text, 'clear': clear, 'press_enter': press_enter})

def scroll(x, y, direction='down', times=3):
    return call_tool('Scroll', {'loc': [x, y], 'direction': direction, 'wheel_times': times})

def shell(cmd, timeout=10):
    return call_tool('Shell', {'command': cmd, 'timeout': timeout})

def screenshot_to_file(filename):
    """Take screenshot on remote machine and download it"""
    # Use Shell to take screenshot via PowerShell
    ps_cmd = f'''
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $b=New-Object System.Drawing.Bitmap($s.Width,$s.Height)
    $g=[System.Drawing.Graphics]::FromImage($b)
    $g.CopyFromScreen(0,0,0,0,$b.Size)
    $b.Save("C:\\Users\\User\\Documents\\GitHub\\DAOV1\\{filename}")
    $g.Dispose()
    $b.Dispose()
    echo "saved"
    '''
    return call_tool('Shell', {'command': ps_cmd, 'timeout': 15})

if __name__ == '__main__':
    init()
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'

    if cmd == 'snapshot':
        print(snapshot())
    elif cmd == 'click':
        x, y = int(sys.argv[2]), int(sys.argv[3])
        print(click(x, y))
    elif cmd == 'type':
        x, y = int(sys.argv[2]), int(sys.argv[3])
        text = sys.argv[4]
        enter = '--enter' in sys.argv
        clear = '--clear' in sys.argv
        print(type_text(x, y, text, clear=clear, press_enter=enter))
    elif cmd == 'scroll':
        x, y = int(sys.argv[2]), int(sys.argv[3])
        direction = sys.argv[4] if len(sys.argv) > 4 else 'down'
        print(scroll(x, y, direction))
    elif cmd == 'shell':
        print(shell(' '.join(sys.argv[2:])))
    elif cmd == 'screenshot':
        fname = sys.argv[2] if len(sys.argv) > 2 else 'remote-screenshot.png'
        print(screenshot_to_file(fname))
