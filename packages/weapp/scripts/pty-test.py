"""Exercise real terminal modes without taking over the user's terminal."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import termios
import time

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / '.cache' / 'qa'
EVIDENCE.mkdir(parents=True, exist_ok=True)


def exercise(name, args, events, width=90, height=28, expected=0):
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', height, width, 0, 0))
    environment = dict(os.environ, TERM='xterm-256color', LANG='en_US.UTF-8', NO_COLOR='1')
    environment.pop('CI', None)
    child = subprocess.Popen(['node', str(ROOT / 'bin/weapp.js'), '--lang', 'en', *args], stdin=slave, stdout=slave, stderr=slave, env=environment)
    chunks = []
    start = time.monotonic()
    sent = 0
    try:
        while child.poll() is None and time.monotonic() - start < 10:
            elapsed = time.monotonic() - start
            while sent < len(events) and elapsed >= events[sent][0]:
                action = events[sent][1]
                if isinstance(action, tuple):
                    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', action[1], action[0], 0, 0))
                    child.send_signal(signal.SIGWINCH)
                else:
                    os.write(master, action)
                sent += 1
            if select.select([master], [], [], .03)[0]:
                chunks.append(os.read(master, 65536))
        assert child.poll() is not None, f'{name}: terminal failed to exit'
        while select.select([master], [], [], .02)[0]:
            chunks.append(os.read(master, 65536))
        assert child.returncode == expected, f'{name}: exit {child.returncode}'
        assert termios.tcgetattr(slave) == original, f'{name}: raw mode not restored'
        output = b''.join(chunks)
        assert b'\x1b[?25h' in output, f'{name}: cursor not restored'
        assert output.count(b'\x1b[?1049h') == output.count(b'\x1b[?1049l'), f'{name}: alternate screen not restored'
        (EVIDENCE / f'terminal-{name}.txt').write_bytes(output)
        return output
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=5)
        os.close(master)
        os.close(slave)


results = {}
results['opening-and-exit'] = len(exercise('opening', [], [(.25, b'x'), (.55, b'q')]))
results['effects-controls-resize'] = len(exercise('effects', ['fx', 'logo'], [(.25, b' '), (.4, b'r'), (.5, b'\x1b[C'), (.65, (30, 12)), (.8, (100, 30)), (1, b'q')]))
results['duration-exit'] = len(exercise('duration', ['fx', 'fireworks', '--duration', '.2'], []))
results['interrupt-restoration'] = len(exercise('interrupt', ['fx', 'matrix'], [(.4, b'\x03')], expected=130))
results['snake-controls'] = len(exercise('snake', ['play', 'snake'], [(.3, b'w'), (.45, b' '), (.6, (22, 13)), (.75, b'r'), (1, b'q')]))
results['static-effect'] = len(exercise('static', ['fx', 'orbit', '--no-motion'], [(.3, b'\x1b[C'), (.5, b'q')], width=32, height=10))
results['project-search'] = len(exercise('projects', ['projects'], [(.3, b'tailwind'), (.55, b'\r')]))
print('Real PTY checks passed:', json.dumps(results))
