# envy-cli

A small Node.js CLI for listing ports in use and terminating processes that are bound to them.

## What it does

- Shows active TCP/UDP ports and the process using them
- Lists PID, process name, local address, and user
- Lets you kill a process by port or PID
- Works from PowerShell, Command Prompt, or a terminal
- Supports Windows, macOS, and Linux through OS-specific backend implementations

## Cross-platform support

`envy-cli` is built to work across major developer operating systems:

- Windows: uses `netstat` and `tasklist`
- macOS: uses `lsof`
- Linux: reads socket data from `/proc`

The CLI commands stay the same on all platforms, so developers can use the same workflow regardless of machine.

## Requirements

- Node.js 14 or newer
- npm

## Install locally from GitHub

From a terminal:

```bash
git clone https://github.com/<your-username>/envy-cli.git
cd envy-cli
npm install
npm link
```

After `npm link`, the CLI becomes available on your machine as:

```bash
envy-cli --help
```

You can also use the older alias:

```bash
portcli --help
```

## Run it

### Show help

```bash
envy-cli --help
```

### List all ports

```bash
envy-cli list
```

### Filter by a specific port

```bash
envy-cli list --port 3000
```

### Filter by protocol

```bash
envy-cli list --proto tcp
```

### Kill a process by port

```bash
envy-cli kill 3000
```

This will prompt for confirmation unless you use `--yes`:

```bash
envy-cli kill 3000 --yes
```

### Force kill a process

```bash
envy-cli kill 3000 --force
```

### Kill by PID

```bash
envy-cli kill-pid 12345
```

## Windows usage

In PowerShell:

```powershell
cd E:\envy-cli
npm install
npm link
envy-cli list
```

If you are running the script directly without linking:

```powershell
cd E:\envy-cli
node .\src\cli.js list
```

## Developer notes

This project uses a package bin entry, so it can be installed globally on a developer machine using `npm link` after cloning the repo.

The main entry point is:

- `src/cli.js`

## Example output

```text
PORT  PROTO  STATUS  LOCAL ADDRESS      PID  PROCESS     USER
3000  tcp    LISTEN  0.0.0.0:3000       1234 node        user
```

## License

MIT
