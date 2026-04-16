---
name: system-info
description: "Show current server basic performance info: CPU, memory, disk, and load. Use when the user asks about server status, system performance, or resource usage."
---

# System Info

Collect and display current server performance information.

## Step 1: Collect Data

Run the following commands to gather system info:

- **OS**: `uname -a`
- **Uptime & Load**: `uptime`
- **CPU**: `nproc` for core count; `top -l 1 -n 0` (macOS) or `top -bn1 | head -5` (Linux) for usage
- **Memory**: `vm_stat` (macOS) or `free -h` (Linux)
- **Disk**: `df -h` (filter to physical disks, skip tmpfs/devfs)
- **Top Processes**: `ps aux --sort=-%mem | head -6` or `ps aux -m | head -6` (macOS)

Detect the OS first, then pick the correct commands.

## Step 2: Output Report

Present in this format:

```
## Server Performance Report

**Host**: {hostname}
**OS**: {os_name} {version}
**Uptime**: {uptime}

### CPU
- Cores: {count}
- Load Average: {1min} / {5min} / {15min}
- Usage: {user}% user, {sys}% system, {idle}% idle

### Memory
- Total: {total}
- Used: {used} ({percent}%)
- Available: {available}

### Disk
| Mount | Size | Used | Avail | Use% |
|-------|------|------|-------|------|
| /     | ...  | ...  | ...   | ...  |

### Top Processes (by memory)
| PID | User | %CPU | %MEM | Command |
|-----|------|------|------|---------|
| ... | ...  | ...  | ...  | ...     |
```

## Rules

- Run commands one by one. If a command fails, skip it and note "unavailable".
- Do NOT install any packages. Use only built-in system commands.
- Report numbers as-is from the system. Do NOT estimate or calculate values you cannot verify.
