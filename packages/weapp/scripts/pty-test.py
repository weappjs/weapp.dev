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
METRICS = {}


def exercise(name, args, events, width=90, height=28, expected=0, command=None, require_events=False, cwd=None):
    """Wait for fresh output markers, or a delay after the preceding action."""
    if cwd is None:
        with tempfile.TemporaryDirectory(prefix='weapp-pty-cwd-') as directory:
            return exercise(name, args, events, width, height, expected, command, require_events, cwd=directory)
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', height, width, 0, 0))
    environment = dict(os.environ, TERM='xterm-256color', LANG='en_US.UTF-8', NO_COLOR='1')
    environment.pop('CI', None)
    executable = command or ['node', str(ROOT / 'dist/cli.js')]
    start = time.monotonic()
    child = subprocess.Popen([*executable, '--lang', 'en', *args], stdin=slave, stdout=slave, stderr=slave, env=environment, cwd=cwd)
    chunks = []
    first_actionable = None
    sent = 0
    event_cursor = 0
    last_event_time = 0.0
    try:
        while child.poll() is None and time.monotonic() - start < 12:
            elapsed = time.monotonic() - start
            output = b''.join(chunks)
            while sent < len(events):
                trigger, action = events[sent]
                position = output.find(trigger, event_cursor) if isinstance(trigger, bytes) else -1
                ready = position >= 0 if isinstance(trigger, bytes) else elapsed - last_event_time >= trigger
                if not ready:
                    break
                event_cursor = position + len(trigger) if isinstance(trigger, bytes) else len(output)
                last_event_time = elapsed
                if isinstance(action, signal.Signals):
                    child.send_signal(action)
                elif isinstance(action, tuple):
                    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', action[1], action[0], 0, 0))
                    child.send_signal(signal.SIGWINCH)
                else:
                    os.write(master, action)
                sent += 1
            if select.select([master], [], [], .03)[0]:
                chunks.append(os.read(master, 65536))
                visible = b''.join(chunks)
                if first_actionable is None and (not args or args == ['--no-motion']) and all(marker in visible for marker in [b'WORKBENCH', b'Create with weapp-vite']) and (b'Enter / C' in visible or b'Enter open / C' in visible):
                    first_actionable = round((time.monotonic() - start) * 1000, 2)
        if child.poll() is None:
            (EVIDENCE / f'terminal-{name}.txt').write_bytes(b''.join(chunks))
            raise AssertionError(f'{name}: terminal failed to exit after event {sent}/{len(events)}')
        while select.select([master], [], [], .02)[0]:
            chunks.append(os.read(master, 65536))
        output = b''.join(chunks)
        (EVIDENCE / f'terminal-{name}.txt').write_bytes(output)
        assert not require_events or sent == len(events), f'{name}: exited before the final input event'
        assert child.returncode == expected, f'{name}: exit {child.returncode}'
        assert termios.tcgetattr(slave) == original, f'{name}: raw mode not restored'
        assert b'\x1b[?25h' in output, f'{name}: cursor not restored'
        assert output.count(b'\x1b[?1049h') == output.count(b'\x1b[?1049l'), f'{name}: alternate screen not restored'
        if first_actionable is not None:
            METRICS[name] = {'firstActionableMs': first_actionable, 'columns': width, 'rows': height}
        return output
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=5)
        os.close(master)
        os.close(slave)


def single_screen(output, name):
    assert output.count(b'\x1b[?1049h') == 1, f'{name}: nested terminal ownership'


def save_frame(output, name, title=None):
    rows = {}
    for match in re.finditer(rb'\x1b\[2J|\x1b\[(\d+);1H(.*?)\x1b\[K', output, re.S):
        if match.group(1) is None:
            if title and title in rows.get(1, ''):
                break
            rows.clear()
        else:
            row = int(match.group(1))
            value = match.group(2).decode('utf-8')
            if row == 1 and title and title in rows.get(1, '') and title not in value:
                break
            rows[row] = value
    frame = '\n'.join(rows.get(index, '') for index in range(1, max(rows, default=0) + 1))
    (EVIDENCE / f'terminal-{name}-frame.txt').write_text(frame + '\n')


results = {}
opening = exercise('opening', [], [(b'Enter / C', b'\r'), (b'NEW PROJECT DIRECTORY', b'\x1b'), (b'WORKBENCH', b'q')])
single_screen(opening, 'opening')
assert b'WORKBENCH' in opening and b'Create with weapp-vite' in opening
assert b'NEW PROJECT DIRECTORY' in opening and b'Press any key' not in opening
results['first-enter-without-opening-gate'] = len(opening)
for label, width, height in [('wide', 120, 30), ('normal', 80, 24), ('narrow', 44, 18)]:
    hall = exercise(f'hall-{label}', [], [(b'Enter / C', b'q')], width=width, height=height)
    single_screen(hall, f'hall-{label}')
    assert b'Create with weapp-vite' in hall and b'Press any key' not in hall
    save_frame(hall, f'hall-{label}')
    results[f'actionable-{label}'] = len(hall)
shortcut = exercise('hall-shortcut', [], [(b'WORKBENCH', b'c'), (b'NEW PROJECT DIRECTORY', b'\x1b'), (b'WORKBENCH', b'q')])
assert b'NEW PROJECT DIRECTORY' in shortcut
results['hall-c-shortcut'] = len(shortcut)
idle = exercise('idle', [], [(b'Enter / C', b'x'), (.7, b'q')], width=120, height=30)
scene_rows = [row for row in re.findall(rb'\x1b\[\d+;1H(.*?)\x1b\[K', idle) if re.search(rb'[\xe2][\xa0-\xa3]', row)]
assert len(set(scene_rows)) > 5, 'idle: the live workbench did not animate'
results['idle-workbench'] = len(idle)
more = exercise('more', ['--no-motion'], [(b'Enter / C', b'\x1b[A\r'), (b'MORE TOOLS', b'q'), (b'WORKBENCH', b'q')])
assert b'MORE TOOLS' in more and b'Generate a QR code' in more
assert b'snake' not in more.lower() and b'game' not in more.lower(), 'more: hidden games leaked into navigation'
single_screen(more, 'more')
results['hidden-game-navigation'] = len(more)
browse = exercise('browse', ['--no-motion'], [(b'Enter / C', b'\x1b[B\r'), (b'ECOSYSTEM', b'\r'), (b'Capabilities', b'\x1b'), (b'ECOSYSTEM', b'\x1b'), (b'WORKBENCH', b'q')])
assert b'Capabilities' in browse and b'Vite' in browse
single_screen(browse, 'browse')
results['same-screen-project-detail'] = len(browse)
hall_interrupt = exercise('hall-fx-interrupt', ['--no-motion'], [(b'Enter / C', b'\x1b[A\r'), (b'MORE TOOLS', b'\x1b[A\r'), (b'LOGO', b'\x03')], expected=130)
assert b'LOGO' in hall_interrupt, 'hall-fx-interrupt: effect was not opened'
results['hall-effect-global-interrupt'] = len(hall_interrupt)
results['effects-controls-resize'] = len(exercise('effects', ['fx', 'logo'], [(b'LIVE', b' '), (b'PAUSED', b'r'), (.1, b'\x1b[C'), (.15, (30, 12)), (.15, (100, 30)), (.2, b'q')]))
results['duration-exit'] = len(exercise('duration', ['fx', 'fireworks', '--duration', '.2'], []))
results['interrupt-restoration'] = len(exercise('interrupt', ['fx', 'matrix'], [(b'LIVE', b'\x03')], expected=130))
results['snake-controls'] = len(exercise('snake', ['play', 'snake'], [(b'SNAKE', b'w'), (.15, b' '), (.15, (22, 13)), (.15, b'r'), (.25, b'q')]))
results['static-effect'] = len(exercise('static', ['fx', 'orbit', '--no-motion'], [(b'ORBIT', b'\x1b[C'), (b'MATRIX', b'q')], width=32, height=10))
results['project-search'] = len(exercise('projects', ['projects'], [(b'Search:', b'tailwind'), (b'Search: tailwind', b'\r')]))

with tempfile.TemporaryDirectory(prefix='weapp-pty-') as temporary:
    parent = Path(temporary)
    target = parent / 'my-app'
    for label, events in [
        ('loading', [(b'Enter / C', b'\r\x1b'), (.6, b'q')]),
    ]:
        rapid = exercise(f'rapid-cancel-{label}', ['--no-motion'], events, require_events=True)
        single_screen(rapid, f'rapid-cancel-{label}')
        assert not target.exists()
        results[f'rapid-create-cancel-{label}'] = len(rapid)
    cancelled = exercise('wizard-cancel', ['create', '--no-motion'], [(b'NEW PROJECT DIRECTORY', str(target).encode() + b'\r'), (b'CHOOSE A TEMPLATE', b'\x1b'), (b'NEW PROJECT DIRECTORY', b'\x1b')])
    assert b'CHOOSE A TEMPLATE' in cancelled
    assert not target.exists(), 'wizard-cancel: a cancelled wizard created a directory'
    single_screen(cancelled, 'wizard-cancel')
    results['wizard-cancel'] = len(cancelled)
    preview = exercise('wizard-preview', ['create', '--dry-run', '--no-motion'], [(b'NEW PROJECT DIRECTORY', str(target).encode() + b'\r'), (b'CHOOSE A TEMPLATE', b'\r'), (b'READY TO CREATE', b'\r')])
    assert b'create-weapp-vite@latest' in preview and b'Working directory' in preview
    assert not target.exists(), 'wizard-preview: a dry run created a directory'
    single_screen(preview, 'wizard-preview')
    results['wizard-summary-preview'] = len(preview)
    for label, width, height in [('wide', 120, 30), ('normal', 80, 24), ('narrow', 44, 18)]:
        constellation = exercise(f'wizard-{label}', ['create', '--dry-run', '--no-motion'], [(b'NEW PROJECT DIRECTORY', str(target).encode() + b'\r'), (b'CHOOSE A TEMPLATE', b'\x1b[B\x1b[B\r'), (b'READY TO CREATE', b'\x1b')], width=width, height=height)
        assert b'Template: react' in constellation and b'Enter create' in constellation
        assert not target.exists()
        save_frame(constellation, f'wizard-{label}', title='READY TO CREATE')
        results[f'creation-layout-{label}'] = len(constellation)

    project = parent / 'existing-project'
    project.mkdir()
    (project / 'package.json').write_text(json.dumps({'name': 'existing-pty-project', 'version': '1.0.0', 'scripts': {'test': 'node action.cjs'}}))
    action_script = project / 'action.cjs'
    action_script.write_text("console.log('PROJECT_SCRIPT_COMPLETED')\n")
    action_events = [
        (b'Enter open / C', b'\r'),
        (b'CURRENT PROJECT', b'\x1b'),
        (b'WORKBENCH', b'\x1b[B\x1b[B\x1b[B\r'),
        (b'PROJECT SCRIPTS', b'\r'),
        (b'CONFIRM PROJECT ACTION', b'\r'),
    ]
    executed = exercise('existing-project-script', ['--no-motion'], [*action_events, (b'Action completed.', b'\x1b'), (b'WORKBENCH', b'q')], cwd=project, require_events=True)
    assert b'PROJECT_SCRIPT_COMPLETED' in executed and b'npm run test' in executed
    assert executed.count(b'\x1b[?1049h') == 2, 'existing-project-script: workbench did not resume exactly once'
    results['existing-project-script-and-resume'] = len(executed)
    action_script.write_text("""
const { writeFileSync } = require('node:fs');
writeFileSync('script.pid', String(process.pid));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { console.log('PROJECT_SCRIPT_INTERRUPTED'); process.exit(130); });
console.log('PROJECT_SCRIPT_READY');
setInterval(() => {}, 1000);
""")
    interrupted = exercise('existing-project-cancel', ['--no-motion'], [*action_events, (b'PROJECT_SCRIPT_READY', signal.SIGINT), (b'Cancelled; child processes cleaned up.', b'\x1b'), (b'WORKBENCH', b'q')], cwd=project, require_events=True)
    assert b'PROJECT_SCRIPT_INTERRUPTED' in interrupted
    assert interrupted.count(b'\x1b[?1049h') == 2, 'existing-project-cancel: workbench did not resume exactly once'
    script_pid = int((project / 'script.pid').read_text())
    try:
        os.kill(script_pid, 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError('existing-project-cancel: script process survived cancellation')
    results['existing-project-cancel-and-resume'] = len(interrupted)

    harness = parent / 'upstream.mjs'
    cli_url = (ROOT / 'dist/index.js').as_uri()
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
    rapid = exercise('rapid-cancel-directory', ['--no-motion'], [(b'Enter / C', b'\r'), (b'NEW PROJECT DIRECTORY', str(target).encode() + b'\r\x1b'), (.6, b'q')], command=['node', str(harness)], require_events=True)
    single_screen(rapid, 'rapid-cancel-directory')
    assert not target.exists()
    results['rapid-create-cancel-directory'] = len(rapid)
    for label, width, height in [('wide', 120, 30), ('normal', 80, 24), ('narrow', 44, 18)]:
        created = parent / f'created-{label}'
        inherited = exercise(f'upstream-input-{label}', ['--no-motion'], [(b'Enter / C', b'\r'), (b'NEW PROJECT DIRECTORY', str(created).encode() + b'\r'), (b'CHOOSE A TEMPLATE', b'\r'), (b'READY TO CREATE', b'\r'), (b'UPSTREAM_READY', b'accepted\r'), (b'Project created', b'\rq')], width=width, height=height, command=['node', str(harness)])
        assert b'PARENT_INPUT raw=false flowing=false listeners=0' in inherited, 'upstream-input: parent still owns the terminal'
        assert b'UPSTREAM_MODE raw=false' in inherited and b'UPSTREAM_READ=accepted' in inherited, 'upstream-input: upstream missed input'
        assert b'Project created' in inherited and b'WORKBENCH' in inherited
        assert inherited.count(b'\x1b[?1049h') == 2, 'upstream-input: workbench did not resume exactly once'
        assert json.loads((created / 'package.json').read_text())['dependencies']['weapp-vite'] == '^1.0.0'
        save_frame(inherited, f'success-{label}', title='PROJECT CREATED')
        results[f'inherited-upstream-input-and-resume-{label}'] = len(inherited)

    exception_harness = parent / 'exception.mjs'
    session_url = (ROOT / 'dist/terminal.js').as_uri()
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

(EVIDENCE / 'terminal-metrics.json').write_text(json.dumps(METRICS, indent=2) + '\n')
print('Real PTY checks passed:', json.dumps(results))
print('Actionable terminal timings:', json.dumps(METRICS))
