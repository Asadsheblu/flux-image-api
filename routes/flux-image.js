// routes/pi-img.js

import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

router.get('/', async (req, res) => {
  const { prompt, width, height, seed: seedParam, numImages } = req.query;

  const seed = seedParam && seedParam !== '' ? seedParam : '42';
  const totalImages = parseInt(numImages || '1', 100);
  const apiKey = process.env.POLLINATIONS_API_KEY;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  console.log('Received generation request:');
  console.log('Prompt:', prompt);
  console.log('Width:', width);
  console.log('Height:', height);
  console.log('Seed (used):', seed);
  console.log('Number of Images (to generate):', totalImages);
  console.log('Using API Key:', apiKey ? 'Set' : 'Not Set');

  let generatedImageUrls = [];

  for (let i = 0; i < totalImages; i++) {
    let currentSeed = (parseInt(seed) + i).toString();
    let imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true`;

    if (width) imageUrl += `&width=${width}`;
    if (height) imageUrl += `&height=${height}`;
    imageUrl += `&seed=${currentSeed}`;

    console.log(`Making Pollinations.AI call ${i + 1}/${totalImages}: ${imageUrl}`);

    try {
      const response = await axios.get(imageUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const contentType = response.headers['content-type'];
      let base64Prefix = 'data:image/jpeg;base64,';
      if (contentType.includes('image/png')) base64Prefix = 'data:image/png;base64,';
      else if (contentType.includes('image/gif')) base64Prefix = 'data:image/gif;base64,';

      const base64Image = Buffer.from(response.data, 'binary').toString('base64');
      generatedImageUrls.push(`${base64Prefix}${base64Image}`);

      if (totalImages > 1 && i < totalImages - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Error generating image ${i + 1}/${totalImages} from Pollinations.AI for prompt "${prompt.substring(0, 30)}...":`, error.message);
      generatedImageUrls.push('/error-placeholder.png');

      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          return res.status(status).json({ error: 'Authentication failed or invalid API key.' });
        }
        if (status === 429) {
          return res.status(status).json({ error: 'Rate limit exceeded for Pollinations.AI. Please try again later.' });
        }
      } else if (error.request) {
        console.error('No response received from Pollinations.AI.');
      } else {
        console.error('Error setting up Pollinations.AI request.');
      }
    }
  }

  if (generatedImageUrls.length === 0) {
    return res.status(500).json({ error: 'No images could be generated.' });
  }

  return res.status(200).json({ imageUrls: generatedImageUrls });
});

export default router;
