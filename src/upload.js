const path = require('path');
const convertHeicToJpeg = require('./convert');
const extractMetadata = require('./metadata');
const pool = require('../db');

module.exports = async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

try {
  const jpegPath = await convertHeicToJpeg(req.file.path);
  const metadata = await extractMetadata(jpegPath);

  const { date, coordinates } = metadata;

  console.log('Extracted Metadata:', metadata);

  const query = `
      INSERT INTO records (file_name, date, latitude, longitude)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const values = [
      path.basename(req.file.path),
      date,
      coordinates.latitude,
      coordinates.longitude
    ];

    console.log('Formatted Date:', date);

    const result = await pool.query(query, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).send('Internal Server Error');
  }
};
