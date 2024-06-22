const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { Client } = require('pg');
const exifParser = require('exif-parser');
const convertHeicToJpeg = require('./convert');

const app = express();
const PORT = 3000;

// Database configuration
const dbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'database',
    password: 'testovanikryptologie',
    port: 5432,
};

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Set up Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded JPEG files
app.use('/uploads', express.static(uploadDir));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the upload page
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Handle file upload and conversion
app.post('/api/upload', upload.single('heicFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded' });
    }

    const filePath = path.join(__dirname, 'uploads', req.file.filename);

    // Convert the uploaded HEIC file to JPEG
    convertHeicToJpeg(filePath)
        .then((jpegPath) => {
            // Insert metadata into the database
            insertMetadata(jpegPath)
                .then(() => {
                    res.send({ message: 'File uploaded successfully and metadata inserted into the database', file: req.file });
                })
                .catch((error) => {
                    console.error('Error inserting metadata into database:', error);
                    res.status(500).send({ message: 'An error occurred during database insertion' });
                });
        })
        .catch((error) => {
            console.error('Error converting file:', error);
            res.status(500).send({ message: 'An error occurred during conversion' });
        });
});

// Handle record retrieval
app.get('/record', async (req, res) => {
    const recordId = req.query.id;

    // Connect to the database
    const client = new Client(dbConfig);
    await client.connect();

    try {
        // Query the database for the record with the specified ID
        const query = 'SELECT * FROM records WHERE id = $1';
        const result = await client.query(query, [recordId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // Send the record details as JSON response
        res.json({ record: result.rows[0] });
    } catch (error) {
        console.error('Error retrieving record from database:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        // Close the database connection
        await client.end();
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Function to convert epoch timestamp to ISO 8601 format
const epochToIso8601 = (epoch) => {
    const date = new Date(epoch * 1000); // Convert to milliseconds
    return date.toISOString();
};

// Function to insert metadata into the database
const insertMetadata = async (filePath) => {
    // Read the JPEG file
    const data = fs.readFileSync(filePath);

    // Parse EXIF metadata
    const parser = exifParser.create(data);
    const result = parser.parse();

    const timestamp = result.tags.DateTimeOriginal;
    const latitude = result.tags.GPSLatitude;
    const longitude = result.tags.GPSLongitude;

    // Convert the timestamp to ISO 8601 format
    const isoTimestamp = epochToIso8601(timestamp);

    // Convert the absolute path to a relative path
    const relativePath = path.relative(__dirname, filePath).replace(/\\/g, '/');

    // Insert metadata into the database
    const client = new Client(dbConfig);
    await client.connect();

    try {
        const query = `
            INSERT INTO records (timestamp, longitude, latitude, path)
            VALUES ($1, $2, $3, $4)
        `;
        const values = [isoTimestamp, longitude, latitude, relativePath];
        await client.query(query, values);
    } finally {
        await client.end();
    }
};
