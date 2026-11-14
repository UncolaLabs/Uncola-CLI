#!/usr/bin/env python3
"""Drives a full-screen coding agent (Claude Code, Kiro) in a pseudo-terminal, typing like a person.

Usage: agent-chat.py STEP... -- COMMAND...
Steps run in order:
  wait:REGEX    wait until the screen shows REGEX (up to 4 minutes)
  idle:REGEX    wait until REGEX has been off the screen for 2 s (the agent stopped working)
  type:TEXT     type TEXT at a human pace, then press Enter
  keys:TEXT     send TEXT as is (\\r, \\x1b and other escapes allowed), without typing delays
  sleep:SECS    pause, e.g. to give the viewer time to read
The screen is emulated with pyte (pip install pyte) so the patterns match what a viewer sees.
Set AGENT_CHAT_SCREEN=<file> to keep the last screen there, which helps when writing new steps.
"""
import fcntl
import os
import pty
import re
import select
import struct
import sys
import termios
import time

import pyte

CHAR_DELAY = 0.035
WAIT_LIMIT = 240


def main() -> int:
    args = sys.argv[1:]
    sep = args.index("--")
    steps, command = args[:sep], args[sep + 1:]
    rows, cols = struct.unpack("hh", fcntl.ioctl(1, termios.TIOCGWINSZ, b"\0" * 4)) if os.isatty(1) else (40, 120)

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(command[0], command)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("hhhh", rows, cols, 0, 0))

    screen = pyte.Screen(cols, rows)
    stream = pyte.ByteStream(screen)
    dump = os.environ.get("AGENT_CHAT_SCREEN")
    shown = [True]

    def pump(timeout: float) -> bool:
        """Copies child output to our stdout and the screen; returns False once the child is gone."""
        ready, _, _ = select.select([fd], [], [], timeout)
        if not ready:
            return True
        try:
            data = os.read(fd, 65536)
        except OSError:
            return False
        if not data:
            return False
        if shown[0]:
            os.write(1, data)
        stream.feed(data)
        answer(data)
        return True

    def answer(data: bytes) -> None:
        """Answers the terminal queries agents send at start-up; they wait for these before reading keys."""
        if b"\x1b[c" in data or b"\x1b[0c" in data:
            os.write(fd, b"\x1b[?62;22c")  # a VT220-class terminal
        if b"\x1b[6n" in data:
            os.write(fd, f"\x1b[{screen.cursor.y + 1};{screen.cursor.x + 1}R".encode())

    def text() -> str:
        shown = "\n".join(line.rstrip() for line in screen.display)
        if dump:
            with open(dump, "w") as f:
                f.write(shown)
        return shown

    def until(done, what: str) -> None:
        deadline = time.monotonic() + WAIT_LIMIT
        while not done():
            if time.monotonic() > deadline:
                text()
                sys.exit(f"agent-chat: gave up waiting for {what}")
            if not pump(0.2):
                sys.exit(f"agent-chat: the agent exited while waiting for {what}")

    def send(data: bytes) -> None:
        os.write(fd, data)
        pump(0)

    for step in steps:
        kind, _, arg = step.partition(":")
        if kind == "wait":
            pattern = re.compile(arg)
            until(lambda: pattern.search(text()), repr(arg))
        elif kind == "idle":
            pattern = re.compile(arg)
            clear_since = [None]

            def stopped() -> bool:
                if pattern.search(text()):
                    clear_since[0] = None
                elif clear_since[0] is None:
                    clear_since[0] = time.monotonic()
                return clear_since[0] is not None and time.monotonic() - clear_since[0] >= 2

            until(stopped, f"{arg!r} to go away")
        elif kind == "type":
            for ch in arg:
                send(ch.encode())
                end = time.monotonic() + CHAR_DELAY
                while time.monotonic() < end:
                    pump(max(0, end - time.monotonic()))
            end = time.monotonic() + 0.6
            while time.monotonic() < end:
                pump(0.1)
            send(b"\r")
        elif kind == "keys":
            send(arg.encode().decode("unicode_escape").encode("latin-1"))
        elif kind == "sleep":
            end = time.monotonic() + float(arg)
            while time.monotonic() < end:
                pump(0.1)
        else:
            sys.exit(f"agent-chat: unknown step {step!r}")

    text()
    # Leave the agent off camera, so the clip ends on the last answer rather than the exit screen.
    # Ctrl-C twice is the usual way out, and the child is ours to end.
    shown[0] = False
    for _ in range(2):
        send(b"\x03")
        time.sleep(0.4)
    end = time.monotonic() + 5
    while time.monotonic() < end and pump(0.2):
        pass
    if os.waitpid(pid, os.WNOHANG) == (0, 0):
        os.kill(pid, 9)
        os.waitpid(pid, 0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
