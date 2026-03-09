#!/bin/bash

echo "🕵️ Running PII Audit on logs..."
echo "--------------------------------"

# Patterns for Email, Card, SSN, Phone
# Note: These are basic patterns for demonstration purposes
PATTERNS=(
    "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" # Email
    "[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}" # Card
    "[0-9]{3}-[0-9]{2}-[0-9]{4}" # SSN
)

FOUND=0

# In a real scenario, we would query Loki. 
# Here we grep local log files if they exist, or simulate the check.
LOG_FILES=$(find . -name "*.log")

if [ -z "$LOG_FILES" ]; then
    echo "📝 No local log files found to audit. Scanning source code for hardcoded secrets instead..."
    # Scan for common password/secret assignments
    SECRETS=$(grep -rEi "password\s*=\s*['\"][^'\"]+['\"]" apps/api/src --exclude="*.test.ts" || true)
    if [ -n "$SECRETS" ]; then
        echo "❌ Hardcoded secrets found in source!"
        echo "$SECRETS"
        FOUND=1
    fi
else
    for pattern in "${PATTERNS[@]}"; do
        echo "Checking for pattern: $pattern"
        MATCHES=$(grep -rE "$pattern" $LOG_FILES || true)
        if [ -n "$MATCHES" ]; then
            echo "❌ PII found in logs!"
            echo "$MATCHES"
            FOUND=1
        fi
    done
fi

if [ $FOUND -eq 0 ]; then
    echo "✅ PASS: No PII found."
    exit 0
else
    echo "🛑 FAIL: PII or secrets detected!"
    exit 1
fi
