#!/bin/bash

echo "🔍 Auditing routes for Zod validation..."
echo "----------------------------------------"

# Find all POST, PATCH, PUT routes that do NOT contain 'validateBody'
MISSING=$(grep -rE "\.(post|patch|put)\(" apps/api/src/modules --include="*.router.ts" | grep -v "validateBody" || true)

if [ -z "$MISSING" ]; then
    echo "✅ All mutation routes have validation!"
else
    echo "❌ The following routes might be missing Zod validation:"
    echo "$MISSING"
    exit 1
fi
