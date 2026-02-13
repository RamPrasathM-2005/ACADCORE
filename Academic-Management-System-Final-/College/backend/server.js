// server.js
import db, { initDatabase } from './models/index.js';
import app from './app.js';

const PORT = process.env.PORT || 4000;

// Single initialization flow
const startServer = async () => {
  try {
    // 1. Initialize DB and Seed (This handles sync and seeding internally)
    await initDatabase();

    // 2. Start the Express Server
    app.listen(PORT, () => {
      console.log(`✅ Server is running perfectly on port ${PORT}`);
    });

  } catch (err) {
    console.error('❌ Failed to start server due to Data Error:', err);
    process.exit(1); // Stop the process if DB fails
  }
};

startServer();