const express = require('express');
const multer = require('multer');
const uploadHandler = require('./src/upload');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/upload', upload.single('file'), uploadHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on http://localhost:${PORT}');
});
