-- Create test database for running automated tests
SELECT 'CREATE DATABASE pyr_test OWNER pyr'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pyr_test')\gexec

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE pyr_test TO pyr;
