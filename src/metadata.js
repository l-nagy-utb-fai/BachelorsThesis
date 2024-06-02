const { exiftool } = require('exiftool-vendored');
const fs = require('fs');

module.exports = async (filePath) => {
  try {
    const metadata = await exiftool.read(filePath);
    const { DateTimeOriginal, GPSLatitude, GPSLongitude } = metadata;

    const formattedDate = new Date(DateTimeOriginal).toISOString().split('.')[0] + 'Z';

    return {
      date: formattedDate,
      coordinates: {
        latitude: GPSLatitude,
        longitude: GPSLongitude,
      },
    };
  } catch (error) {
    console.error('Error reading metadata:', error);
    throw error;
  } finally {
    fs.unlinkSync(filePath);
  }
};
