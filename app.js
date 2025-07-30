import express from 'express';
import cors from 'cors';
import piImgRoute from './routes/flux-image.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use('/api/flux-image', piImgRoute);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
