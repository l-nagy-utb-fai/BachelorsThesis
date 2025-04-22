const fs = require('fs'); // //Reading and writing to files
const path = require('path'); // Path manipulation
const multer = require('multer'); // Multer for file uploads
const { Client } = require('pg'); //Interaction with database
const exifParser = require('exif-parser'); //Metadata extraction
const fetch = require('node-fetch'); //Sending HTTP requests
const convertHeicToJpeg = require('./convert');

//Getting to uploads directory
const uploadDir = path.join(__dirname, 'uploads'); // Path to directory
if (!fs.existsSync(uploadDir)) { // Checking the existence of directory
    fs.mkdirSync(uploadDir); // Creates directory if not existing
}

//Information for storing data
const storage = multer.diskStorage({
    destination: (req, file, cb) => { //Where to
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => { //Name (original)
        cb(null, file.originalname);
    }
});

//Initialization of data storing
const upload = multer({ storage: storage });

//HEIC file upload and conversion
async function uploadHEIC (req, res, dbConfig) {
    const client = new Client(dbConfig);
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
            const { status, locationId, original, miniature } = filePairs[key];

            if (original) {
                // Case 1 or 2: Original exists (with or without Miniature)
                const originalPath = path.join(uploadDir, original.filename);
                const jpegOriginalPath = await convertHeicToJpeg(originalPath);

                let jpegMiniaturePath = null;
                if (miniature) {
                    const miniaturePath = path.join(uploadDir, miniature.filename);
                    jpegMiniaturePath = await convertHeicToJpeg(miniaturePath);
                }
                // Insert metadata into database using the converted original and (if available) miniature paths.
                await insertMetadata(jpegOriginalPath, jpegMiniaturePath, locationId, status, client);
            } else if (miniature) {
                // Case 3: Only Miniature uploaded.
                const miniaturePath = path.join(uploadDir, miniature.filename);
                // Convert and move the miniature file, but do not insert metadata.
                await convertHeicToJpeg(miniaturePath);
            }
        }

        res.status(200).send({ message: 'Files uploaded successfully and metadata inserted where applicable.' });
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).send({ message: 'An error occurred during file processing' });
    } finally {
        await client.end();
    }
}

// Extract location ID and status from file name
const parseFileName = (fileName) => {
    const regex = /^(\d{6})\+(\d{3})\+([A-Za-z])\+([OM])\.heic$/i; // Match 4 digits, followed by anything but '+', followed by 3 digits, a status letter, and O/M
    const match = fileName.match(regex);

    if (match && match.length === 5) {
        const ID = parseInt(match[1], 10);
        const locationId = parseInt(match[2], 10) || 999; // Convert the first part (location ID) to an integer
        const status = match[3] || 'S'; // Fourth group is status
        const type = match[4]; // Fifth group is O/M for Original/Miniature
        return { ID, status, locationId, type };
    }

    throw new Error(`Invalid file name format: ${fileName}`);
   // return { status: null, locationId: null, type: null };
};

//Metadata insertion to database
async function insertMetadata (filePath, miniatureFilePath, locationId, status, client) { //By JPEG path  
    if (!client) {
        console.error('Database client is undefined');
        throw new Error('Database client is required');
    }
    
    const data = fs.readFileSync(filePath);
    const parser = exifParser.create(data); 
    const result = parser.parse();
    const timestamp = result.tags.DateTimeOriginal || '946749389';
    const latitude = result.tags.GPSLatitude || 0.0000;
    const longitude = result.tags.GPSLongitude || 0.0000;

    // Convert the timestamp to ISO 8601 format
    const isoTimestamp = epochToIso8601(timestamp);

    // Convert the absolute path to a relative path
    const relativePath = path.relative(__dirname, filePath).replace(/\\/g, '/');//Absolute path to relative
    const relativeMiniaturePath = miniatureFilePath ? path.relative(__dirname, miniatureFilePath).replace(/\\/g, '/') : null;

    // Get the address using reverse geocoding
    const address = await reverseGeocode(latitude, longitude);

    try {
        const query = `
            INSERT INTO records (timestamp, longitude, latitude, path, pathMiniature, location_id, address, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        const values = [isoTimestamp, longitude, latitude, relativePath, relativeMiniaturePath, locationId, address, status];
        await client.query(query, values);
    } catch (error) {
        console.error('Error inserting metadata:', error);    
    }
}

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

//Epoch time conversion to ISO 8601
const epochToIso8601 = (epoch) => {
    const date = new Date(epoch * 1000); //Conversion to milliseconds (js)
    return date.toISOString();
};

//Location upload
async function uploadLocation (req, res, dbConfig) {
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
}

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

const possibleStatuses = [
    'V - V pořádku', 
    'D - Darován', 
    'Z - Ztracen', 
    'N - Nevyfocen', 
    'L - Bez zadané lokace', 
    'G - Byl mi darován', 
    'S - Status není určitelný', 
    'J - S jinou fotografií'
];

// Exporting the upload middleware
module.exports = { upload, uploadDir, uploadHEIC, uploadLocation, parseFileName, formatTimestamp, decimalToDMS, formatCoordinates, translateStatus, possibleStatuses };
