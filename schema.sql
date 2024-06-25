-- schema.sql

-- Create the database
CREATE DATABASE database;

-- Connect to the database
\c database;

CREATE TABLE locations(
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

-- Create the records table
CREATE TABLE records (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    latitude DECIMAL(8, 6) NOT NULL,
    path TEXT NOT NULL,
    comment TEXT,
    location_id INT REFERENCES locations(id)
);
