---
name: log-analysis
description: "Analyze uploaded log files to identify errors, exceptions, anomalies, and root causes. Use when the user uploads or pastes log content."
---

# Log Analysis

Analyze log files uploaded by the user. Follow these steps in order.

## Step 0: Check for Log File

Before doing anything else, check if the user has provided a log file:
- If the user uploaded a file → proceed to Step 1
- If the user pasted log content in the message → proceed to Step 1
- If neither → reply with exactly: "请先上传日志文件或粘贴日志内容，我再进行分析。" Then STOP. Do not continue.

If the uploaded file is not a log file (e.g., image, PDF, code file with no log content) → reply with exactly: "上传的文件不是日志文件，请上传 .log、.txt 或其他包含日志内容的文件。" Then STOP.

## Step 1: Identify Log Format

Read the file. Determine the log format:
- If structured (JSON, CSV): parse fields directly
- If plain text: identify the timestamp format, log level pattern, and message structure
- If unknown format: ask the user one clarifying question

## Step 2: Extract Key Findings

Scan the full log content and extract:

1. **Errors & Exceptions**: all ERROR/FATAL/EXCEPTION lines, grouped by type
2. **Warnings**: WARNING lines that may indicate problems
3. **Timeline**: when the first error occurred, when the last error occurred
4. **Frequency**: how many times each error type appears

## Step 3: Pattern Analysis

Look for these patterns:
- If the same error repeats > 3 times → flag as "recurring issue"
- If errors cluster within a short time window → flag as "error storm"
- If a warning appears before an error → flag as "potential cause"
- If stack traces are present → extract the root cause frame (first non-library frame)

## Step 4: Output Report

Present findings in this exact format:

```
## Log Analysis Report

**File**: {filename}
**Time Range**: {first_timestamp} — {last_timestamp}
**Total Lines**: {count} | Errors: {count} | Warnings: {count}

### Critical Issues
1. {error_type} — {count} occurrences
   - First seen: {timestamp}
   - Root cause: {description}

### Warnings
1. {warning_summary}

### Timeline
{chronological summary of key events}

### Recommendation
{1-3 actionable next steps}
```

## Rules

- Do NOT guess or fabricate log content. Only report what is in the file.
- If the log is too large to process at once, analyze the first and last 500 lines, then report the coverage.
- If no errors or warnings are found, say so clearly.
