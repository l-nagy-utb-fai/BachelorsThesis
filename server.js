const express = require('express'); //Web-app framework 
const path = require('path'); //Path manipulation
const fs = require('fs'); //Reading and writing TO files
const { Client } = require('pg'); //Interaction with database
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const { upload, uploadDir, uploadHEIC, uploadLocation, formatTimestamp, formatCoordinates, translateStatus, possibleStatuses } = require('./uploadData');
const top5Locations = require('./queries');

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

//Uploading fronentd pages and JPEG photos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
});
app.get('/zaznamy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'records.html'));
});
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});
app.get('/seznam', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'list.html'));
});
app.get('/statistiky', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'statistics.html'));
});

// Middlewares for file upload
app.post('/upload', upload.single('file'), (req, res) => {
    // Handle the uploaded file here
    if (req.file) {
        return res.status(200).json({ message: 'File uploaded successfully', file: req.file });
    }
    return res.status(400).json({ message: 'File upload failed' });
});
app.post('/api/upload', upload.array('files'), (req, res) => uploadHEIC(req, res, dbConfig));
app.post('/api/uploadLocation', express.json(), (req, res) => uploadLocation(req, res, dbConfig));

// New route to fetch locations
app.get('/api/locations', async (req, res) => {
    const client = new Client(dbConfig);
    await client.connect();

    try {
        const result = await client.query('SELECT id, name, comment, anonymized FROM locations');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching locations from database:', error);
        res.status(500).send({ message: 'An error occurred while fetching locations' });
    } finally {
        await client.end();
    }
});

//Retrieving record by ID
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

// Route to fetch all records
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

app.get('/api/statuses', (req, res) => {
    res.json({statuses: possibleStatuses});
});

app.use(bodyParser.json());

app.post('/api/generate_pdf_range', (req, res) => {
    console.log('Generate PDF range endpoint called');
    const { min_id, max_id } = req.body;

    if (min_id === undefined || max_id === undefined) {
        return res.status(400).json({ error: 'Missing min_id or max_id' });
    }
    
    try {
        const pythonProcess = spawn('python', ['pdfGenerator.py', min_id, max_id]);

        pythonProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            res.status(200).json({ message: data.toString() });
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            res.status(500).json({ message: 'Error running script' });
        });

        pythonProcess.on('error', (err) => {
            console.error('Failed to start subprocess:', err);
            res.status(500).json({ message: 'Failed to start subprocess' });
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                res.status(500).json({ message: 'Script execution failed' });
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Failed to execute script' });
    }
});

// Retrieving coordinates by ID
app.get('/coordinates', async (req, res) => {
    const recordId = req.query.id; // Getting ID from query
    const client = new Client(dbConfig); // Connecting to the database
    await client.connect();

    try {
        const query = `
            SELECT 
                id, 
                latitude,
                longitude
            FROM records
            WHERE id = $1
        `;

        const result = await client.query(query, [recordId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        const record = result.rows[0];
        res.json({
            id: record.id,
            latitude: record.latitude,
            longitude: record.longitude
        });
    } catch (error) {
        console.error('Error retrieving coordinates from database:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await client.end(); // Closing the database connection
    }
});

app.post('/save-screenshot', (req, res) => {
    const { image, recordId } = req.body;
    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const filePath = path.join(__dirname, 'mapy', `${recordId}.png`);

    fs.writeFile(filePath, base64Data, 'base64', (err) => {
        if (err) {
            console.error('Error saving screenshot:', err);
            return res.status(500).json({ message: 'Failed to save screenshot.' });
        }
        res.json({ message: 'Screenshot saved successfully.' });
    });
});

//Calling queries functions
top5Locations(app, dbConfig);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});