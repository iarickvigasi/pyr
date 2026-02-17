#!/bin/sh
set -e

echo "🚀 Starting PYR Backend..."

# Run database migrations
# This ensures the database schema is up-to-date before the app starts
echo "📊 Running database migrations..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "✅ Migrations completed successfully"
else
  echo "❌ ERROR: Database migration failed"
  exit 1
fi

# Start the application
echo "🌐 Starting application server..."
exec node dist/server.js
