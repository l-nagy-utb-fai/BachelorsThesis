// convert.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const exifParser = require('exif-parser');
const { Client } = require('pg');

// Database configuration
const dbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'database',
    password: 'testovanikryptologie',
    port: 5432,
};

const convertHeicToJpeg = (filePath) => {
    const outputFilePath = filePath.replace(/\.[^/.]+$/, ".jpg"); // Change extension to .jpg

    // Use ImageMagick's convert command to convert HEIC to JPEG
    exec(`magick convert "${filePath}" "${outputFilePath}"`, (err, stdout, stderr) => {
        if (err) {
            console.error('Error converting file:', err);
            return;
        }

        // Delete the original HEIC file
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting original file:', err);
                return;
            }

            console.log(`Converted ${filePath} to ${outputFilePath} and deleted the original file.`);
            
            // Extract EXIF data from the JPEG file
            fs.readFile(outputFilePath, (err, data) => {
                if (err) {
                    console.error('Error reading JPEG file:', err);
                    return;
                }

                const parser = exifParser.create(data);
                const result = parser.parse();

                const timestamp = result.tags.DateTimeOriginal;
                const latitude = result.tags.GPSLatitude;
                const longitude = result.tags.GPSLongitude;

                // Store metadata in the database
                const client = new Client(dbConfig);
                client.connect();

                const query = `
                    INSERT INTO records (timestamp, longitude, latitude, path)
                    VALUES (to_timestamp($1), $2, $3, $4)
                `;
                const values = [timestamp, longitude, latitude, outputFilePath];

                client.query(query, values, (err, res) => {
                    if (err) {
                        console.error('Error inserting data into database:', err);
                    } else {
                        console.log('Data inserted into database:', res);
                    }

                    client.end();
                });
            });
        });
    });
};

module.exports = convertHeicToJpeg;
