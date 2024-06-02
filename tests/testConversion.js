const convertHeicToJpeg = require('../src/convert');

const testConversion = async () => {
  try {
    const jpegPath = await convertHeicToJpeg("C:\\Users\\ladna\\OneDrive\\Desktop\\Bakalářka\\1191_2024-03-04_070400.HEIC");
    console.log('Conversion successful, JPEG path:', jpegPath);
  } catch (error) {
    console.error('Conversion failed:', error);
  }
};

testConversion();
