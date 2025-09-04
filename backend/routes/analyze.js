const express = require('express');
const router = express.Router();
const ee = require('@google/earthengine');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

// --- Direct Import of Credentials ---
const privateKey = require('../credentials.json');

// --- Import our GEE analysis script ---
const { performAnalysis } = require('../gee/ee_script');

// --- GEE Authentication ---
const authenticateGEE = () => {
  ee.data.authenticateViaPrivateKey(
    privateKey,
    () => {
      console.log('GEE Authentication successful.');
      ee.initialize(null, null, 
        () => { console.log('GEE Initialized.'); },
        (err) => { console.error('GEE Initialization error:', err); }
      );
    },
    (err) => { console.error('GEE Authentication error:', err); }
  );
};
authenticateGEE();

// --- Helper Function to get Road Data from OpenStreetMap ---
const getRoadDistance = async (geometry) => {
    try {
        const centroid = turf.centroid(geometry);
        const [lon, lat] = centroid.geometry.coordinates;

        // Overpass API query to find the nearest primary/secondary road
        const query = `[out:json][timeout:25];
        (
          way["highway"~"^(primary|secondary|tertiary|trunk)$"](around:10000,${lat},${lon});
        );
        out geom;`;
        
        const response = await axios.post('https://overpass-api.de/api/interpreter', `data=${encodeURIComponent(query)}`);
        
        if (response.data.elements.length === 0) {
            return 10; // Default to 10km if no roads are found within 10km
        }

        const roadFeatures = response.data.elements.map(el => {
            if (el.type === 'way' && el.geometry) {
                return turf.lineString(el.geometry.map(pt => [pt.lon, pt.lat]));
            }
            return null;
        }).filter(Boolean);

        if(roadFeatures.length === 0) return 10;
        
        const roadCollection = turf.featureCollection(roadFeatures);
        const nearestPoint = turf.nearestPointOnLine(roadCollection, centroid, { units: 'kilometers' });
        
        return nearestPoint.properties.dist;

    } catch (error) {
        console.error("Error fetching from Overpass API:", error.response ? error.response.data : error.message);
        return null; // Return null on error
    }
};

// --- Helper Function to get Seismic Zone from local GeoJSON ---
const getSeismicZone = (geometry) => {
    try {
        const seismicDataPath = path.join(__dirname, '..', 'gee', 'seismic_zones.json');
        const seismicZones = JSON.parse(fs.readFileSync(seismicDataPath, 'utf8'));
        const centroid = turf.centroid(geometry);

        for (const feature of seismicZones.features) {
            if (turf.booleanPointInPolygon(centroid, feature.geometry)) {
                return feature.properties.zone;
            }
        }
        return 2; // Default to Zone 2 (Low Risk) if not found
    } catch (error) {
        console.error("Error reading or processing seismic zones file:", error);
        return null; // Return null on error
    }
};

/**
 * @route   POST /api/analyze
 * @desc    Receives AOI, gets external data, and triggers GEE analysis
 */
router.post('/', async (req, res) => {
  const { geometry } = req.body;

  if (!geometry || !geometry.coordinates) {
    return res.status(400).json({ error: 'Missing geometry data.' });
  }

  console.log('Received geometry. Starting all analyses...');

  try {
    // --- Run all analyses in parallel ---
    const [roadDistance, seismicZone, geeResults] = await Promise.all([
      getRoadDistance(geometry),
      getSeismicZone(geometry),
      performAnalysis(geometry) // GEE script now runs in parallel
    ]);

    // --- Combine results ---
    const finalResults = {
      ...geeResults, // Results from GEE
      proximityToRoads: roadDistance,
      seismicRisk: seismicZone
    };

    console.log('All analyses complete. Sending results to frontend.');
    res.status(200).json(finalResults);

  } catch (error) {
    console.error('Error during main analysis pipeline:', error);
    res.status(500).json({ error: 'An error occurred on the server during analysis.' });
  }
});

module.exports = router;
