const { exec } = require('child_process');
const path = require('path');

module.exports = (filePath) => {
  return new Promise((resolve, reject) => {
    const outputFilePath = path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.jpg`);
    const command = `magick ${filePath} ${outputFilePath}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error converting HEIC to JPEG: ${error.message}`);
        return reject(new Error('Conversion failed'));
      }
      resolve(outputFilePath);
    });
  });
};
