#!/bin/bash
set -e

# Configuration
TARGET_DB=$1
BACKUP_PATH=$2 # Expected format: bucket/filename.gpg
GPG_PASSPHRASE=${GPG_PASSPHRASE:-"ccmp-resilience-secret"}
MINIO_ALIAS="local"
RESTORE_DIR="/tmp/restore"

if [ -z "$TARGET_DB" ] || [ -z "$BACKUP_PATH" ]; then
    echo "❌ Usage: ./restore.sh <target_db_name> <minio_bucket/file.gpg>"
    exit 1
fi

mkdir -p "$RESTORE_DIR"

echo "⏬ Downloading backup from MinIO: $BACKUP_PATH..."
mc cp "$MINIO_ALIAS/$BACKUP_PATH" "$RESTORE_DIR/restore.gpg"

echo "🔓 Decrypting backup..."
gpg --batch --yes --passphrase "$GPG_PASSPHRASE" --decrypt -o "$RESTORE_DIR/restore.sql" "$RESTORE_DIR/restore.gpg"

echo "🏗️ Restoring to database: $TARGET_DB..."
# Create DB if it doesn't exist
psql -h localhost -U postgres -d postgres -c "CREATE DATABASE $TARGET_DB;" || true
psql -h localhost -U postgres "$TARGET_DB" < "$RESTORE_DIR/restore.sql"

echo "✅ Restore complete!"

# Cleanup
rm -rf "$RESTORE_DIR"
