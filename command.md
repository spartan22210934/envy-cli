# envy-cli Commands

This file lists the available commands for the `envy-cli` tool.

## General

### Help
```bash
envy-cli --help
```

### Version
```bash
envy-cli --version
```

## Port listing

### List all open ports
```bash
envy-cli list
```

### List a specific port
```bash
envy-cli list --port 3000
```

### Filter by protocol
```bash
envy-cli list --proto tcp
envy-cli list --proto udp
```

## Finding processes

### Find by process name, PID, or address
```bash
envy-cli find node
envy-cli find vite
envy-cli find 3000
```

## Fixing port conflicts

### Kill the process using a port
```bash
envy-cli fix 3000
```

### Kill without confirmation prompt
```bash
envy-cli fix 3000 --yes
```

### Force kill a process
```bash
envy-cli fix 3000 --force
```

## Watching a port

### Watch a port and refresh automatically
```bash
envy-cli watch 3000
```

### Change polling interval
```bash
envy-cli watch 3000 --interval 2000
```

## Reserving a port

### Reserve a port so no other app can bind to it
```bash
envy-cli reserve 3000
```

### Reserve on a specific host
```bash
envy-cli reserve 3000 --host 127.0.0.1
```

## Killing by port

### Kill process on a port
```bash
envy-cli kill 3000
```

### Skip confirmation
```bash
envy-cli kill 3000 --yes
```

### Force kill
```bash
envy-cli kill 3000 --force
```

## Killing by PID

### Kill a process by PID
```bash
envy-cli kill-pid 12345
```

### Skip confirmation
```bash
envy-cli kill-pid 12345 --yes
```

### Force kill
```bash
envy-cli kill-pid 12345 --force
```

## Desktop UI

### Launch the local desktop interface
```bash
envy-cli desktop
```

### Use a custom port for the UI
```bash
envy-cli desktop --port 4000
```

## Developer usage examples

```bash
envy-cli list
envy-cli fix 3000 --yes
envy-cli find node
envy-cli reserve 8080
envy-cli watch 3000
```
