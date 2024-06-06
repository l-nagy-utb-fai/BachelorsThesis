// server.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const convertHeicToJpeg = require('./convert');

const app = express();
const PORT = 3000;

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

// Handle file upload and conversion
app.post('/upload', upload.single('heicFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded' });
    }

    const filePath = path.join(__dirname, 'uploads', req.file.filename);

    // Convert the uploaded HEIC file to JPEG
    convertHeicToJpeg(filePath);

    res.send({ message: 'File uploaded successfully and conversion started', file: req.file });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
