const express = require('express'); //Web-app framework 
const path = require('path'); //Path manipulation
const multer = require('multer'); //Upload and storage
const fs = require('fs'); //Reading and writing TO files
const { Client } = require('pg'); //Interaction with database
const exifParser = require('exif-parser'); //Metadata extraction
const convertHeicToJpeg = require('./convert');
const fetch = require('node-fetch'); //Je to k něčemu?

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
        cb(null, file.originalname);
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
app.get('/database', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'database.html'));
});


// Handle HEIC file upload and conversion
app.post('/api/upload', upload.array('files'), async (req, res) => {
    const client = new Client(dbConfig); // Initialize the database client
    await client.connect();
    
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).send({ message: 'No files uploaded' });
        }

        // Separate files into Original and Miniature pairs
        const filePairs = {};
        files.forEach(file => {
            const { ID, status, locationId, type } = parseFileName(file.originalname);
            if (!filePairs[ID]) {
                filePairs[ID] = { ID, status, locationId };
            }
            filePairs[ID][type === 'O' ? 'original' : 'miniature'] = file;
        });

        for (const key in filePairs) {
            const { ID, status, locationId, original, miniature } = filePairs[key];
            if (!original || !miniature) {
                return res.status(400).send({ message: 'Original and Miniature file pair not found' });
            }

            const originalPath = path.join(uploadDir, original.filename);
            const miniaturePath = path.join(uploadDir, miniature.filename);

            const jpegOriginalPath = await convertHeicToJpeg(originalPath);
            const jpegMiniaturePath = await convertHeicToJpeg(miniaturePath);

            // Insert metadata for the "Original" file
            await insertMetadata(jpegOriginalPath, jpegMiniaturePath, locationId, status);
        }

        res.status(200).send({ message: 'Files uploaded successfully and metadata inserted into the database' });
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).send({ message: 'An error occurred during file processing' });
    }
});


// New route to handle location uploads
app.post('/api/uploadLocation', express.json(), async (req, res) => {
    const { locationName, comment, anonymized } = req.body;

    if (!locationName || !comment) {
        return res.status(400).send({ message: 'Location name and comment are required' });
    }

    const client = new Client(dbConfig);
    await client.connect();

    try {
        const query = 'INSERT INTO locations (name, comment, anonymized) VALUES ($1, $2, $3) RETURNING id';
        const result = await client.query(query, [locationName, comment, anonymized]);

        res.send({ message: 'Location uploaded successfully', locationId: result.rows[0].id });
    } catch (error) {
        console.error('Error inserting location into database:', error);
        res.status(500).send({ message: 'An error occurred during location insertion' });
    } finally {
        await client.end();
    }
});

// New route to fetch locations
app.get('/api/locations', async (req, res) => {
    const client = new Client(dbConfig);
    await client.connect();

    try {
        const result = await client.query('SELECT id, name FROM locations');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching locations from database:', error);
        res.status(500).send({ message: 'An error occurred while fetching locations' });
    } finally {
        await client.end();
    }
});

// Function to reverse geocode latitude and longitude to an address
async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.error) {
            let address = '';

            if (data.address.house_number) {
                address += data.address.house_number + ' ';
            }
            if (data.address.road) {
                address += data.address.road + ', ';
            }
            if (data.address.postcode) {
                address += data.address.postcode + ' ';
            }
            if (data.address.city) {
                address += data.address.city;
            }

            return address.trim();
        } else {
            return 'Address not found';
        }
    } catch (error) {
        console.error('Error fetching address:', error);
        return 'Error fetching address';
    }
}

//Retrieving records by ID
app.get('/record', async (req, res) => {
    const recordId = req.query.id; //Getting ID
    const client = new Client(dbConfig); //Connecting to database
    await client.connect();
    try {
        const query = `
            SELECT 
                records.id, 
                records.timestamp, 
                CASE
                    WHEN locations.anonymized THEN '0.0000'
                    ELSE records.latitude
                END AS latitude,
                CASE
                    WHEN locations.anonymized THEN '0.000'
                    ELSE records.longitude
                END AS longitude,
                CASE
                    WHEN locations.anonymized THEN 'Adresa anonymizována'
                    ELSE records.address
                END AS address,
                CASE
                    WHEN locations.anonymized THEN 'Lokace anonymizována'
                    ELSE COALESCE(locations.name, 'N/A')
                END AS location_name,
                CASE
                    WHEN locations.anonymized THEN 'Komentář anonymizován'
                    ELSE COALESCE(locations.comment, '')
                END AS location_comment, 
                records.status, 
                records.pathminiature,
                records.path
            FROM records
            LEFT JOIN locations ON records.location_id = locations.id
            WHERE records.id = $1
        `;

        const result = await client.query(query, [recordId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }
        const record = result.rows[0];
        const formattedTimestamp = formatTimestamp(record.timestamp);
        const formattedCoordinates = formatCoordinates(record.latitude, record.longitude);
        const translatedStatus = translateStatus(record.status);
        
        const formattedRecord = {
            id: record.id,
            timestampFormatted: formattedTimestamp,
            latitudeFormatted: formattedCoordinates.formattedLatitude,
            longitudeFormatted: formattedCoordinates.formattedLongitude,
            latitudeRaw: record.latitude,
            longitudeRaw: record.longitude,
            address: record.address,
            locationName: record.location_name,
            comment: record.location_comment,
            statusTransformed: translatedStatus,
            pathminiature: record.pathminiature,
            path: record.path
        };     

        res.json({ record: formattedRecord }); //Retrieving data
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
async function insertMetadata (filePath, miniatureFilePath, locationId, status) { //By JPEG path
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
    const relativeMiniaturePath = path.relative(__dirname, miniatureFilePath).replace(/\\/g, '/');

    // Get the address using reverse geocoding
    const address = await reverseGeocode(latitude, longitude);

    // Insert metadata into the database
    const client = new Client(dbConfig); //
    await client.connect();

    try {
        const query = `
            INSERT INTO records (timestamp, longitude, latitude, path, pathMiniature, location_id, address, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        const values = [isoTimestamp, longitude, latitude, relativePath, relativeMiniaturePath, locationId, address, status];
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
    let seconds = date.getSeconds();

    if (seconds < 10) seconds = '0' + seconds; // Add leading zero if minutes are less than 10
    // Format hours and minutes to match the specified format
    if (minutes < 10) minutes = '0' + minutes; // Add leading zero if minutes are less than 10
    // Adjust hours to be in 24-hour format
    if (hours < 10) hours = '0' + hours; // Add leading zero if hours are less than 10

    // Construct the formatted date string
    const formattedDate = `${dayOfWeek} ${dayOfMonth}. ${month} ${year} v ${hours}:${minutes}:${seconds}`;

    return formattedDate;
};

// Extract location ID and status from file name
const parseFileName = (fileName) => {
    const regex = /^(\d{4})\+(\d{3})\+([A-Za-z])\+([OM])\.heic$/i; // Match 4 digits, followed by anything but '+', followed by 3 digits, a status letter, and O/M    const match = fileName.match(regex);
    const match = fileName.match(regex);

    if (match && match.length === 5) {
        const ID = parseInt(match[1], 10);
        const locationId = parseInt(match[2], 10); // Convert the first part (location ID) to an integer
        const status = match[3]; // Fourth group is status
        const type = match[4]; // Fifth group is O/M for Original/Miniature
        return { ID, status, locationId, type };
    }

    throw new Error(`Invalid file name format: ${fileName}`);
   // return { status: null, locationId: null, type: null };
};

// Route to fetch records
app.get('/api/records', async (req, res) => {
    const client = new Client(dbConfig);
    await client.connect();

    try {
        const query = `
            SELECT 
                records.id, 
                records.timestamp, 
                    CASE
                        WHEN locations.anonymized THEN '0.0000'
                        ELSE records.latitude
                    END AS latitude,
                    CASE
                        WHEN locations.anonymized THEN '0.000'
                        ELSE records.longitude
                    END AS longitude,
                    CASE
                        WHEN locations.anonymized THEN 'Adresa anonymizována'
                        ELSE records.address
                    END AS address,
                    CASE
                        WHEN locations.anonymized THEN 'Lokace anonymizována'
                        ELSE COALESCE(locations.name, 'N/A')
                    END AS location_name,
                    CASE
                        WHEN locations.anonymized THEN 'Komentář anonymizován'
                        ELSE COALESCE(locations.comment, '')
                    END AS location_comment, 
                    records.status, 
                    records.pathminiature
            FROM records
            LEFT JOIN locations ON records.location_id = locations.id
        `;
        const result = await client.query(query);
        
        const records = result.rows.map(record => {
            const formattedCoordinates = formatCoordinates(record.latitude, record.longitude);
            return {
                id: record.id,
                timestamp: formatTimestamp(new Date(record.timestamp)),
                latitude: formattedCoordinates.formattedLatitude,
                longitude: formattedCoordinates.formattedLongitude,
                status: translateStatus(record.status),
                address: record.address,
                locationName: record.location_name,
                locationComment: record.location_comment,
                pathMiniature: record.pathminiature
            };
        });
        res.json({ records });
    } catch (error) {
        console.error('Error fetching records from database:', error);
        res.status(500).json({ error: 'Failed to fetch records' });
    } finally {
        await client.end();
    }
});

       // Function to convert decimal degrees to degrees, minutes, and seconds
       const decimalToDMS = (decimal) => {
        const degrees = Math.floor(decimal);
        const minutesDecimal = (decimal - degrees) * 60;
        const minutes = Math.floor(minutesDecimal);
        const seconds = ((minutesDecimal - minutes) * 60).toFixed(1);

        return { degrees, minutes, seconds };
    };

        // Function to format coordinates based on provided rules
        const formatCoordinates = (latitude, longitude) => {
            let latitudeSuffix = latitude < 0 ? 'J' : 'S';
            let longitudeSuffix = longitude < 0 ? 'Z' : 'V';

            // Convert latitude and longitude to absolute values for formatting
            const absLatitude = Math.abs(latitude);
            const absLongitude = Math.abs(longitude);

            // Convert decimal coordinates to DMS format
            const latitudeDMS = decimalToDMS(absLatitude);
            const longitudeDMS = decimalToDMS(absLongitude);

            // Format latitude and longitude as DMS
            const formattedLatitude = `${latitudeDMS.degrees}° ${latitudeDMS.minutes}' ${latitudeDMS.seconds}" ${latitudeSuffix}`;
            const formattedLongitude = `${longitudeDMS.degrees}° ${longitudeDMS.minutes}' ${longitudeDMS.seconds}" ${longitudeSuffix}`;

            return {
                formattedLatitude,
                formattedLongitude
            };
        };

// Function to translate status
const translateStatus = (status) => {
    switch (status) {
        case 'V':
            return 'V pořádku';
        case 'D':
            return 'Darován';
        case 'Z':
            return 'Ztracen';
        case 'N':
            return 'Nevyfocen';
        case 'L':
            return 'Bez zadané lokace';
        case 'G':
            return 'Byl mi darován';
        case 'S':
            return 'Status není určitelný';
        case 'J':
            return 'S jinou fotografií';
        default:
            return 'Status neznámý';
    }
};