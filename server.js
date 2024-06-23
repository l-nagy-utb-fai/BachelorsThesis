const express = require('express'); //Web-app framework 
const path = require('path'); //Path manipulation
const multer = require('multer'); //Upload and storage
const fs = require('fs'); //Reading and writing TO files
const { Client } = require('pg'); //Interaction with database
const exifParser = require('exif-parser'); //Metadata extraction
const convertHeicToJpeg = require('./convert'); 

const app = express(); //Instance of express app
const PORT = 3000;

// Database configuration
const dbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'database',
    password: 'testovanikryptologie',
    port: 5432,
};

const uploadDir = path.join(__dirname, 'uploads'); //Path to uploads dir.
if (!fs.existsSync(uploadDir)) { //Checks existence of uploads dir.
    fs.mkdirSync(uploadDir); //Creates dir. if not existing
}

const storage = multer.diskStorage({ //How to store data
    destination: (req, file, cb) => { //Where - uploads
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => { //Name - timestamp + random number
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage }); //Initialization

//Uploading fronentd pages and JPEG photos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.post('/api/upload', upload.single('heicFile'), (req, res) => { //HEIC upload
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded' });
    }
    const filePath = path.join(__dirname, 'uploads', req.file.filename); //To uploads dir.
    convertHeicToJpeg(filePath) //Conversion to JPEG
        .then((jpegPath) => { //Metadata to database insertion
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

//Retrieving records by ID
app.get('/record', async (req, res) => {
    const recordId = req.query.id; //Getting ID
    const client = new Client(dbConfig); //Connecting to database
    await client.connect();
    try {
        const query = 'SELECT * FROM records WHERE id = $1';
        const result = await client.query(query, [recordId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }
        const record = result.rows[0];
        const formattedTimestamp = formatTimestamp(record.timestamp);
        record.timestampFormatted = formattedTimestamp;        

        res.json({ record }); //Retrieving data
    } catch (error) {
        console.error('Error retrieving record from database:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.end(); //Closing database
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


//Epoch time conversion to ISO 8601
const epochToIso8601 = (epoch) => {
    const date = new Date(epoch * 1000); //Conversion to milliseconds (js)
    return date.toISOString();
};

//Metadata insertion to database
const insertMetadata = async (filePath) => { //By JPEG path
    const data = fs.readFileSync(filePath);
    const parser = exifParser.create(data); 
    const result = parser.parse();
    const timestamp = result.tags.DateTimeOriginal;
    const latitude = result.tags.GPSLatitude;
    const longitude = result.tags.GPSLongitude;

    // Convert the timestamp to ISO 8601 format
    const isoTimestamp = epochToIso8601(timestamp);

    // Convert the absolute path to a relative path
    const relativePath = path.relative(__dirname, filePath).replace(/\\/g, '/');//Absolute path to relative

    // Insert metadata into the database
    const client = new Client(dbConfig); //
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

// Function to format timestamp as desired for frontend display
const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp); // Parse the ISO 8601 timestamp string
    const daysOfWeek = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
    const months = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

    const dayOfWeek = daysOfWeek[date.getDay()];
    const dayOfMonth = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    let hours = date.getHours();
    let minutes = date.getMinutes();

    // Format hours and minutes to match the specified format
    if (minutes < 10) {
        minutes = '0' + minutes; // Add leading zero if minutes are less than 10
    }

    // Adjust hours to be in 24-hour format
    if (hours < 10) {
        hours = '0' + hours; // Add leading zero if hours are less than 10
    }

    // Construct the formatted date string
    const formattedDate = `${dayOfWeek} ${dayOfMonth}. ${month} ${year} v ${hours}.${minutes}`;

    return formattedDate;
};

/*
    // Convert the timestamp to ISO 8601 format
    const epochTimestamp = timestamp; // Your epoch timestamp
    // Convert epoch timestamp to milliseconds (required by Date constructor)
    const milliseconds = epochTimestamp * 1000; 
    // Create a new Date object
    const date = new Date(milliseconds);
    // Define arrays for days of the week and months in Czech
    const daysOfWeek = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
    const months = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];   
// Get individual components of the date
const dayOfWeek = daysOfWeek[date.getDay()];
const dayOfMonth = date.getDate();
const month = months[date.getMonth()];
const year = date.getFullYear();
let hours = date.getHours();
let minutes = date.getMinutes();
// Format hours and minutes to have leading zeros if necessary
if (minutes < 10) {
    minutes = '0' + minutes;
}
if (hours < 10) {
    hours = '0' + hours;
}
// Construct the formatted date string
const formattedDate = `${dayOfWeek} ${dayOfMonth}. ${month} ${year} v ${hours}.${minutes}`;
console.log(`Formatted Date: ${formattedDate}`);
   
    

console.log(`isoTimestamp: ${isoTimestamp}`);
*/
