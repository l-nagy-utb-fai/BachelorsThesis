-- schema.sql

-- Create the database
CREATE DATABASE database;

-- Connect to the database
\c database;

-- Create the records table
CREATE TABLE records (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    latitude DECIMAL(8, 6) NOT NULL,
    path TEXT NOT NULL,
    comment TEXT
);
