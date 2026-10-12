"""Exercise real terminal modes without taking over the user's terminal."""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / '.cache' / 'qa'
EVIDENCE.mkdir(parents=True, exist_ok=True)


def exercise(name, args, events, width=90, height=28, expected=0, command=None):
    """Events can wait for elapsed time or for a marker from the actual child."""
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', height, width, 0, 0))
    environment = dict(os.environ, TERM='xterm-256color', LANG='en_US.UTF-8', NO_COLOR='1')
    environment.pop('CI', None)
    executable = command or ['node', str(ROOT / 'bin/weapp.js')]
    child = subprocess.Popen([*executable, '--lang', 'en', *args], stdin=slave, stdout=slave, stderr=slave, env=environment)
    chunks = []
    start = time.monotonic()
    sent = 0
    try:
        while child.poll() is None and time.monotonic() - start < 12:
            elapsed = time.monotonic() - start
            output = b''.join(chunks)
            while sent < len(events):
                trigger, action = events[sent]
                ready = trigger in output if isinstance(trigger, bytes) else elapsed >= trigger
                if not ready:
                    break
                if isinstance(action, tuple):
                    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', action[1], action[0], 0, 0))
                    child.send_signal(signal.SIGWINCH)
                else:
                    os.write(master, action)
                sent += 1
            if select.select([master], [], [], .03)[0]:
                chunks.append(os.read(master, 65536))
        if child.poll() is None:
            (EVIDENCE / f'terminal-{name}.txt').write_bytes(b''.join(chunks))
            raise AssertionError(f'{name}: terminal failed to exit after event {sent}/{len(events)}')
        while select.select([master], [], [], .02)[0]:
            chunks.append(os.read(master, 65536))
        output = b''.join(chunks)
        (EVIDENCE / f'terminal-{name}.txt').write_bytes(output)
        assert child.returncode == expected, f'{name}: exit {child.returncode}'
        assert termios.tcgetattr(slave) == original, f'{name}: raw mode not restored'
        assert b'\x1b[?25h' in output, f'{name}: cursor not restored'
        assert output.count(b'\x1b[?1049h') == output.count(b'\x1b[?1049l'), f'{name}: alternate screen not restored'
        return output
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=5)
        os.close(master)
        os.close(slave)


def single_screen(output, name):
    assert output.count(b'\x1b[?1049h') == 1, f'{name}: nested terminal ownership'


results = {}
opening = exercise('opening', [], [(.25, b'x'), (.55, b'q')])
single_screen(opening, 'opening')
assert b'WORKBENCH' in opening and b'Create with weapp-vite' in opening
results['opening-and-exit'] = len(opening)
idle = exercise('idle', [], [(.15, b'x'), (.85, b'q')], width=120, height=30)
scene_rows = [row for row in re.findall(rb'\x1b\[\d+;1H(.*?)\x1b\[K', idle) if re.search(rb'[\xe2][\xa0-\xa3]', row)]
assert len(set(scene_rows)) > 5, 'idle: the live workbench did not animate'
results['idle-workbench'] = len(idle)
more = exercise('more', ['--no-motion'], [(.2, b'\x1b[A'), (.35, b'\r'), (.5, b'q'), (.65, b'q')])
assert b'MORE TOOLS' in more and b'Generate a QR code' in more
assert b'snake' not in more.lower() and b'game' not in more.lower(), 'more: hidden games leaked into navigation'
single_screen(more, 'more')
results['hidden-game-navigation'] = len(more)
browse = exercise('browse', ['--no-motion'], [(.2, b'\x1b[B\r'), (.4, b'\r'), (.6, b'\x1b'), (.8, b'\x1b'), (1, b'q')])
assert b'Capabilities' in browse and b'Vite' in browse
single_screen(browse, 'browse')
results['same-screen-project-detail'] = len(browse)
hall_interrupt = exercise('hall-fx-interrupt', ['--no-motion'], [(.2, b'\x1b[A\r'), (.4, b'\x1b[A\r'), (.65, b'\x03')], expected=130)
assert b'LOGO' in hall_interrupt, 'hall-fx-interrupt: effect was not opened'
results['hall-effect-global-interrupt'] = len(hall_interrupt)
results['effects-controls-resize'] = len(exercise('effects', ['fx', 'logo'], [(.25, b' '), (.4, b'r'), (.5, b'\x1b[C'), (.65, (30, 12)), (.8, (100, 30)), (1, b'q')]))
results['duration-exit'] = len(exercise('duration', ['fx', 'fireworks', '--duration', '.2'], []))
results['interrupt-restoration'] = len(exercise('interrupt', ['fx', 'matrix'], [(.4, b'\x03')], expected=130))
results['snake-controls'] = len(exercise('snake', ['play', 'snake'], [(.3, b'w'), (.45, b' '), (.6, (22, 13)), (.75, b'r'), (1, b'q')]))
results['static-effect'] = len(exercise('static', ['fx', 'orbit', '--no-motion'], [(.3, b'\x1b[C'), (.5, b'q')], width=32, height=10))
results['project-search'] = len(exercise('projects', ['projects'], [(.3, b'tailwind'), (.55, b'\r')]))

with tempfile.TemporaryDirectory(prefix='weapp-pty-') as temporary:
    parent = Path(temporary)
    target = parent / 'my-app'
    cancelled = exercise('wizard-cancel', ['create', '--no-motion'], [(b'NEW PROJECT DIRECTORY', str(target).encode() + b'\r'), (b'CHOOSE A TEMPLATE', b'\x1b'), (.7, b'\x1b')])
    assert b'CHOOSE A TEMPLATE' in cancelled
    assert not target.exists(), 'wizard-cancel: a cancelled wizard created a directory'
    single_screen(cancelled, 'wizard-cancel')
    results['wizard-cancel'] = len(cancelled)
    preview = exercise('wizard-preview', ['create', '--dry-run', '--no-motion'], [(b'NEW PROJECT DIRECTORY', str(target).encode() + b'\r'), (b'CHOOSE A TEMPLATE', b'\r'), (b'READY TO CREATE', b'\r')])
    assert b'create-weapp-vite@latest' in preview and b'Working directory' in preview
    assert not target.exists(), 'wizard-preview: a dry run created a directory'
    single_screen(preview, 'wizard-preview')
    results['wizard-summary-preview'] = len(preview)

    harness = parent / 'upstream.mjs'
    cli_url = (ROOT / 'dist/src/index.js').as_uri()
    upstream = r"""
      const { createInterface } = require('node:readline');
      const { mkdirSync, writeFileSync } = require('node:fs');
      const [directory, dependency] = process.argv.slice(1);
      console.log('UPSTREAM_MODE raw=' + Boolean(process.stdin.isRaw));
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      prompt.question('UPSTREAM_READY\n', answer => {
        console.log('UPSTREAM_READ=' + answer);
        if (answer !== 'accepted') process.exitCode = 2;
        else {
          mkdirSync(directory);
          writeFileSync(directory + '/package.json', JSON.stringify({ dependencies: { [dependency]: '^1.0.0' } }));
        }
        prompt.close();
      });
    """
    harness.write_text(f"""
import process from 'node:process'
import {{ spawn }} from 'node:child_process'
import {{ runCli }} from {json.dumps(cli_url)}
const code = await runCli(process.argv.slice(2), {{
  createOperations: {{
    query: async () => ({{ version: '1.0.0', engines: {{ node: '>=18' }} }}),
    execute: (plan) => new Promise((resolve, reject) => {{
      console.log('PARENT_INPUT raw=' + Boolean(process.stdin.isRaw) + ' flowing=' + process.stdin.readableFlowing + ' listeners=' + process.stdin.listenerCount('keypress'))
      const child = spawn(process.execPath, ['-e', {json.dumps(upstream)}, plan.directory, plan.dependency], {{ cwd: plan.cwd, stdio: 'inherit' }})
      child.on('error', reject)
      child.on('close', (code, signal) => resolve({{ code, signal }}))
    }}),
  }},
}})
process.exitCode = code
""")
    inherited = exercise('upstream-input', ['--no-motion'], [(b'WORKBENCH', b'\r'), (b'NEW PROJECT DIRECTORY', str(target).encode() + b'\r'), (b'CHOOSE A TEMPLATE', b'\r'), (b'READY TO CREATE', b'\r'), (b'UPSTREAM_READY', b'accepted\r'), (b'Project created', b'\rq')], command=['node', str(harness)])
    assert b'PARENT_INPUT raw=false flowing=false listeners=0' in inherited, 'upstream-input: parent still owns the terminal'
    assert b'UPSTREAM_MODE raw=false' in inherited and b'UPSTREAM_READ=accepted' in inherited, 'upstream-input: upstream missed input'
    assert b'Project created' in inherited and b'WORKBENCH' in inherited
    assert inherited.count(b'\x1b[?1049h') == 2, 'upstream-input: workbench did not resume exactly once'
    assert json.loads((target / 'package.json').read_text())['dependencies']['weapp-vite'] == '^1.0.0'
    results['inherited-upstream-input-and-resume'] = len(inherited)

    exception_harness = parent / 'exception.mjs'
    session_url = (ROOT / 'dist/src/terminal/session.js').as_uri()
    exception_harness.write_text(f"""
import process from 'node:process'
import {{ TerminalSession }} from {json.dumps(session_url)}
const owner = new TerminalSession({{ stdin: process.stdin, stdout: process.stdout }})
try {{
  await owner.run({{ render: session => session.render(['REAL_EXCEPTION_TEST']), tick() {{ throw new Error('EXPECTED_CONTROLLER_FAILURE') }} }})
}}
catch (error) {{
  process.stderr.write(error.message + '\\n')
  process.exitCode = 1
}}
""")
    failure = exercise('exception', [], [], command=['node', str(exception_harness)], expected=1)
    assert b'EXPECTED_CONTROLLER_FAILURE' in failure
    results['exception-restoration'] = len(failure)

print('Real PTY checks passed:', json.dumps(results))
