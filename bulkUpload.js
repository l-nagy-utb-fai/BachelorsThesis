const path = require('path'); //Path manipulation
const fs = require('fs'); //Reading and writing TO files
const { Client } = require('pg'); //Interaction with database
const exifParser = require('exif-parser'); //Metadata extraction
const convertHeicToJpeg = require('./convert'); 
const fetch = require('node-fetch');

// Database configuration
const dbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'database',
    password: 'testovanikryptologie',
    port: 5432,
};

// Directory containing HEIC files
const inputDir = path.join(__dirname, 'oldDatabase');
const outputDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Function to process a folder of HEIC files
const processFolder = async (folderPath) => {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
        if (path.extname(file).toLowerCase() === '.heic') {
            const filePath = path.join(folderPath, file);
            try {
                const jpegPath = await convertHeicToJpeg(filePath);
                const comment = ''; // Add any default comment if required
                const locationId = null; // Modify if locationId is to be set dynamically
                await insertMetadata(jpegPath, comment, locationId);
                console.log(`Processed file: ${filePath}`);
            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error);
            }
        }
    }
};

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

//Metadata insertion to database
const insertMetadata = async (filePath, comment, locationId) => { //By JPEG path
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

    // Get the address using reverse geocoding
    const address = await reverseGeocode(latitude, longitude);

    // Insert metadata into the database
    const client = new Client(dbConfig); //
    await client.connect();

    try {
        const query = `
            INSERT INTO records (timestamp, longitude, latitude, path, comment, location_id, address)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        const values = [isoTimestamp, longitude, latitude, relativePath, comment, locationId, address];
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

// Function to generate a unique filename
const generateUniqueFilename = (originalName) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    return uniqueSuffix + path.extname(originalName);
};

// Main function to process the input directory
const main = async () => {
    const files = fs.readdirSync(inputDir);

    for (const file of files) {
        if (path.extname(file).toLowerCase() === '.heic') {
            const originalPath = path.join(inputDir, file);
            const uniqueFilename = generateUniqueFilename(file);
            const newPath = path.join(outputDir, uniqueFilename);

            try {
                // Copy file to the new path with the unique filename
                fs.copyFileSync(originalPath, newPath);

                // Convert HEIC to JPEG and process metadata
                const jpegPath = await convertHeicToJpeg(newPath);
                const comment = ''; // Add any default comment if required
                const locationId = null; // Modify if locationId is to be set dynamically
                await insertMetadata(jpegPath, comment, locationId);
                console.log(`Processed file: ${newPath}`);
            } catch (error) {
                console.error(`Error processing file ${newPath}:`, error);
            }
        }
    }
};

// Run the main function
main();