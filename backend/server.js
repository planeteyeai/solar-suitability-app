// Load environment variables from our .env file
require('dotenv').config();

// Import necessary packages
const express = require('express');
const cors = require('cors');

// --- Import the new route ---
const analyzeRoute = require('./routes/analyze');

// Initialize the Express app
const app = express();

// Define the port the server will run on.
// It will try to use the PORT from the .env file, or default to 3001
const PORT = process.env.PORT || 3001;

// --- Middleware ---
// Enable CORS (Cross-Origin Resource Sharing) so our frontend can talk to our backend
app.use(cors());
// Enable the express server to parse incoming JSON data
app.use(express.json());


// --- Routes ---
// A simple test route to make sure the server is working
app.get('/', (req, res) => {
  res.send('Hello from the Solar Suitability Backend!');
});

// --- Connect the analysis route ---
// Any request to /api/analyze will be handled by the router we created
app.use('/api/analyze', analyzeRoute);


// --- Start the Server ---
// This tells our app to listen for requests on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
