require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const JSZip = require('jszip');
const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');
const { fromEnv } = require('@aws-sdk/credential-provider-env');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: fromEnv()
});

const upload = multer({ dest: 'uploads/' });
const storage = { matches: {} };

app.post('/api/process-faces', upload.fields([
  { name: 'reference', maxCount: 1 },
  { name: 'images', maxCount: 100 }
]), async (req, res) => {
  try {
    console.log('[DEBUG] Received request to /api/process-faces');
    const referenceFile = req.files['reference']?.[0];
    const imageFiles = req.files['images'] || [];

    if (!referenceFile || imageFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing reference image or image folder' });
    }

    let referenceImage = fs.readFileSync(referenceFile.path);
    referenceImage = await sharp(referenceImage)
      .resize({ width: 1000 })
      .jpeg({ quality: 80 })
      .toBuffer();

    const matches = [];

    for (const file of imageFiles) {
      try {
        console.log(`[DEBUG] Processing image: ${file.originalname}`);
        let targetImage = fs.readFileSync(file.path);

        targetImage = await sharp(targetImage)
          .resize({ width: 1000 })
          .jpeg({ quality: 80 })
          .toBuffer();

        const result = await rekognition.send(new CompareFacesCommand({
          SourceImage: { Bytes: referenceImage },
          TargetImage: { Bytes: targetImage },
          SimilarityThreshold: 80
        }));

        if (result.FaceMatches?.length > 0) {
          console.log(`[DEBUG] Match found: ${file.originalname}`);
          matches.push({
            filename: file.originalname,
            similarity: result.FaceMatches[0].Similarity,
            image: targetImage
          });
        }

        fs.unlinkSync(file.path);
      } catch (err) {
        console.error(`Error comparing ${file.originalname}:`, err.message || err);
      }
    }

    fs.unlinkSync(referenceFile.path);
    const matchId = Date.now().toString();
    storage.matches[matchId] = matches;

    res.json({
      success: true,
      matchId,
      count: matches.length,
      matches: matches.map(m => ({
        filename: m.filename,
        similarity: m.similarity
      }))
    });
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/download/:matchId', async (req, res) => {
  try {
    const matches = storage.matches[req.params.matchId] || [];
    const zip = new JSZip();
    matches.forEach(match => {
      zip.file(match.filename, match.image);
    });

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename=matches_${req.params.matchId}.zip`);
    res.send(content);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Download failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
