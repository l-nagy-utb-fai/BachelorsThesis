// convert.js

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const convertHeicToJpeg = (inputPath) => {
    return new Promise((resolve, reject) => {
        const outputPath = inputPath.replace(/\.[^/.]+$/, ".jpg");
        const command = `magick convert ${inputPath} ${outputPath}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error converting file: ${error}`);
                reject(error);
            } else {
                // Delete the original HEIC file after conversion
                fs.unlink(inputPath, (err) => {
                    if (err) {
                        console.error(`Error deleting file: ${err}`);
                        reject(err);
                    } else {
                        console.log(`Converted ${inputPath} to ${outputPath} and deleted the original file.`);
                        resolve(outputPath);
                    }
                });
            }
        });
    });
};

module.exports = convertHeicToJpeg;
