# STM-Core for Linux x86_64

This archive is a self-contained Linux build of STM-Core. It bundles Node.js,
production dependencies and the dashboard assets. A global Node.js or npm
installation is not needed.

## Requirements

- x86_64 Linux with glibc 2.35 or newer (Ubuntu 22.04 or equivalent)
- systemd with a user service manager
- common POSIX userland tools (`bash`, `cp`, `find`, `mkdir`, `mv`, `uname`)
- an active user session for automatic startup through `systemd --user`

## Install or update

Extract the archive and run `./install.sh` as the desktop user. Do not run it
with sudo. Existing configuration, API token and SQLite data are preserved
during an update.

The installer enables and starts `stm-core.service` in the user's systemd
manager. Useful service operations are:

    stm-core status
    stm-core restart
    journalctl --user -u stm-core.service

## Uninstall

Run `~/.local/share/stm-core/uninstall.sh`. The default preserves configuration
and the database. To explicitly remove all STM-Core data, use:

    ~/.local/share/stm-core/uninstall.sh --purge

`--purge` is irreversible and restricted to STM-Core's own data directory.
