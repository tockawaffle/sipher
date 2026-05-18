-- Postgres init script: creates the extra two databases for sipher-b and sipher-c.
-- sipher_a is already created by the POSTGRES_DB env-var in docker-compose.yml.
CREATE DATABASE sipher_b;
CREATE DATABASE sipher_c;
