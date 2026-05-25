# Candooda Bot

This repository contains the Candooda Discord bot. The repository has been extended with Oracle Linux build support and container build tooling.

## Oracle Linux build instructions

The repository now includes two build workflows:

1. `build.sh` - installs Node.js 18 on Oracle Linux, installs dependencies, and adds an optional `systemd` service template.
2. `Dockerfile` / `Makefile` - builds a container image on Oracle Linux or any Docker host.

### Run after cloning

If you clone this repository on an Oracle Linux instance, use the following commands:

```bash
cd candooda-bot
bash build.sh
bun index.js
```

If you still want to use npm in legacy environments, the script will continue to install dependencies in `node_modules`, but Bun is the preferred runtime.

### Bun support

This repository now supports Bun as the runtime for the bot. The project scripts are configured to use Bun for startup and watch mode, and the Docker image builds Bun directly instead of Node.js.

Use:

```bash
npm run start
```

or directly:

```bash
bun index.js
```

`build.sh` will:
- detect the host OS
- install Node.js 18 if needed
- install npm dependencies via `npm ci` or `npm install`
- create a sample `systemd` service file at `/etc/systemd/system/candooda-bot.service`

> Note: `build.sh` is designed to run on Oracle Linux. If you use a different Unix-like distro, you may need to adjust package manager commands.

### Build and run with Docker

There is also container support using the included `Dockerfile`.

```bash
cd candooda-bot
make build
make docker-run
```

This builds `candooda:latest` and runs it with the repository mounted into `/app`.

### NPM script

A convenience npm script has been added:

```bash
npm run build:oracle
```

This simply runs:

```bash
bash build.sh
```

## Files added for Oracle support

- `Dockerfile` — Oracle Linux 9 based container build
- `build.sh` — Oracle Linux install/build script for the bot
- `Makefile` — `build` and `docker-run` targets
- `package.json` updated with `build:oracle` script

## Notes

- The bot itself starts with `npm start` and runs `index.js`.
- Update the systemd service file path and user if you want it to run as a dedicated service account.
