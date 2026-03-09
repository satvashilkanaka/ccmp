#!/bin/bash
set -e

# Configuration
DB_NAME=${DB_NAME:-ccmp}
BACKUP_DIR="/tmp/backups"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
BACKUP_FILE="${DB_NAME}_${TIMESTAMP}.sql"
# In production, use GPG keys or a more secure secret management
GPG_PASSPHRASE=${GPG_PASSPHRASE:-"ccmp-resilience-secret"}
MINIO_ALIAS="local"
MINIO_BUCKET="offsite-backups"

mkdir -p "$BACKUP_DIR"

echo "🚀 Starting backup of $DB_NAME..."
pg_dump -h localhost -U postgres "$DB_NAME" > "$BACKUP_DIR/$BACKUP_FILE"

echo "🔐 Encrypting backup with GPG..."
gpg --batch --yes --passphrase "$GPG_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$BACKUP_DIR/$BACKUP_FILE.gpg" "$BACKUP_DIR/$BACKUP_FILE"

echo "☁️ Uploading to MinIO bucket: $MINIO_BUCKET..."
mc cp "$BACKUP_DIR/$BACKUP_FILE.gpg" "$MINIO_ALIAS/$MINIO_BUCKET/"

echo "✅ Backup complete: $BACKUP_FILE.gpg"

# Cleanup
rm "$BACKUP_DIR/$BACKUP_FILE" "$BACKUP_DIR/$BACKUP_FILE.gpg"
