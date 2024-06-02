CREATE DATABASE photos;

\c photos

CREATE TABLE records (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  ordering_number SERIAL,
  date TIMESTAMP,
  latitude DECIMAL,
  longitude DECIMAL
);
