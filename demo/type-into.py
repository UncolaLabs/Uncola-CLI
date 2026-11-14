#!/usr/bin/env python3
"""Runs a command in a pseudo-terminal and types lines into it like a person.

Usage: type-into.py PROMPT LINE... -- COMMAND...
Waits for PROMPT before typing each LINE, then waits for it once more and sends Ctrl-D.
"""
import os
import pty
import select
import sys
import time

CHAR_DELAY = 0.035
READ_PAUSE = 3.0  # time to read a command's output before typing the next one


def main() -> int:
    args = sys.argv[1:]
    sep = args.index("--")
    prompt, lines, command = args[0].encode(), args[1:sep], args[sep + 1:]

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(command[0], command)

    seen = b""

    def pump(timeout: float) -> bool:
        """Copies child output to our stdout; returns False once the child is gone."""
        nonlocal seen
        ready, _, _ = select.select([fd], [], [], timeout)
        if not ready:
            return True
        try:
            data = os.read(fd, 4096)
        except OSError:
            return False
        if not data:
            return False
        os.write(1, data)
        seen = (seen + data)[-200:]
        return True

    def wait_for_prompt() -> None:
        """Waits for the prompt (readline adds cursor codes after it), giving up after 30 s."""
        nonlocal seen
        deadline = time.monotonic() + 30
        while prompt not in seen:
            if time.monotonic() > deadline:
                sys.exit(f"type-into: no prompt {prompt!r} within 30 s")
            if not pump(1):
                return
        seen = b""

    previous = None
    for line in lines:
        wait_for_prompt()
        # The shell opens on the dashboard; give it time to be read.
        time.sleep(5.0 if previous is None else 1.0 if previous == "clear" else READ_PAUSE)
        previous = line
        for ch in line:
            os.write(fd, ch.encode())
            pump(0)
            time.sleep(CHAR_DELAY)
        time.sleep(0.5)
        os.write(fd, b"\r")
    wait_for_prompt()
    time.sleep(READ_PAUSE)
    os.write(fd, b"\x04")
    while pump(1):
        pass
    os.waitpid(pid, 0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
