const path = require('path');
const extractMetadata = require('../src/metadata');

const jpegFilePath = path.resolve(__dirname, 'C:\\Users\\ladna\\OneDrive\\Desktop\\Bakalářka\\1191_2024-03-04_070400.jpg'); 

async function testMetadataExtraction() {
  try {
    const metadata = await extractMetadata(jpegFilePath);
    console.log('Extracted Metadata:', metadata);
  } catch (error) {
    console.error('Error extracting metadata:', error);
  }
}

testMetadataExtraction();
