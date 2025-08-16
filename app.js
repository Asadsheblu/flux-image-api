// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import paymentsRouter from "./routes/payments.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS – Domain B allow (update as needed)
app.use(cors({
  origin: [
    "https://banglavoice.ai",
    "http://localhost:3000"
  ],
  credentials: false
}));

app.use(express.json());

// Health
app.get("/", (req, res) => res.send("Domain A SSLCommerz API is running"));

// Payments routes
app.use("/api/payments", paymentsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
