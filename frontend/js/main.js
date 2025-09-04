document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Element References ---
    const uploadBtn = document.getElementById('upload-btn');
    const kmlUploadInput = document.getElementById('kml-upload');
    const fileNameDisplay = document.getElementById('file-name').querySelector('span');
    const fileNameContainer = document.getElementById('file-name');
    const landOwnershipSelect = document.getElementById('land-ownership');
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    const decisionMatrixBody = document.getElementById('decision-matrix-body');
    const finalScoreDisplay = document.getElementById('final-score');
    const decisionResultDisplay = document.getElementById('decision-result');
    const suggestionsList = document.getElementById('suggestions-list');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    // --- Event Listeners ---
    uploadBtn.addEventListener('click', () => kmlUploadInput.click());
    kmlUploadInput.addEventListener('change', handleKmlUpload);

    // --- Decision Matrix Configuration ---
    const parametersConfig = [
        { key: 'slope', name: 'Slope', weight: 0.20, unit: '°', higherIsBetter: false, thresholds: { best: 5.7, worst: 15 }, suggestion: 'Look for flatter terrain. High slopes increase construction costs and complexity.' },
        { key: 'ghi', name: 'Sunlight (GHI)', weight: 0.15, unit: ' kWh/m²/day', higherIsBetter: true, thresholds: { best: 5.5, worst: 4.5 }, suggestion: 'Site has lower than ideal solar irradiance. Consider areas with higher GHI for better energy yield.' },
        { key: 'temperature', name: 'Avg. Temperature', weight: 0.07, unit: ' °C', higherIsBetter: false, thresholds: { best: 25, worst: 40 }, suggestion: 'High average temperatures can reduce panel efficiency. Cooler sites are preferable.' },
        { key: 'elevation', name: 'Elevation', weight: 0.03, unit: ' m', suggestion: 'Site is outside the optimal elevation range (50-1500m), which can affect logistics and grid connection.' }, // Special scoring
        { key: 'landCover', name: 'Land Cover', weight: 0.10, suggestion: 'Current land cover (e.g., forest, built-up area) may require significant clearing or preparation.' }, // Special scoring
        { key: 'proximityToLines', name: 'Proximity to Grid', weight: 0.10, unit: ' km', higherIsBetter: false, thresholds: { best: 2, worst: 20 }, suggestion: 'Site is far from existing transmission lines, which will significantly increase grid connection costs.' },
        { key: 'proximityToRoads', name: 'Proximity to Roads', weight: 0.05, unit: ' km', higherIsBetter: false, thresholds: { best: 1, worst: 10 }, suggestion: 'Poor road access will complicate logistics, transport, and construction.' },
        { key: 'waterAvailability', name: 'Water Availability', weight: 0.05, unit: ' km', higherIsBetter: false, thresholds: { best: 2, worst: 15 }, suggestion: 'Site is far from a water source, which is needed for panel cleaning and construction.' },
        { key: 'soilStability', name: 'Soil Stability (Depth)', weight: 0.05, unit: ' cm', higherIsBetter: true, thresholds: { best: 100, worst: 20 }, suggestion: 'Shallow soil depth may complicate foundation work for panel mountings.' },
        { key: 'shading', name: 'Shading (Hillshade)', weight: 0.05, unit: '', higherIsBetter: true, thresholds: { best: 200, worst: 100 }, suggestion: 'Terrain analysis indicates potential shading from nearby hills, which will reduce energy output.' },
        { key: 'dust', name: 'Dust (Aerosol Index)', weight: 0.03, unit: '', higherIsBetter: false, thresholds: { best: 0.1, worst: 0.5 }, suggestion: 'High dust levels will require more frequent panel cleaning, increasing maintenance costs.' },
        { key: 'windSpeed', name: 'Wind Speed', weight: 0.02, unit: ' km/h', higherIsBetter: false, thresholds: { best: 20, worst: 90 }, suggestion: 'Site experiences high wind speeds, requiring more robust and expensive mounting structures.' },
        { key: 'seismicRisk', name: 'Seismic Risk (PGA)', weight: 0.02, unit: ' g', higherIsBetter: false, thresholds: { best: 0.1, worst: 0.4 }, suggestion: 'High seismic risk requires specialized engineering for foundations and structures.' },
        { key: 'floodRisk', name: 'Flood Risk', weight: 0.02, unit: ' ha', higherIsBetter: false, thresholds: { best: 0, worst: 5 }, suggestion: 'A portion of the site is in a flood-prone area, posing a risk to equipment.' },
        { key: 'landOwnership', name: 'Land Ownership', weight: 0.06, suggestion: 'Private land ownership can lead to longer acquisition times and higher costs compared to government land.' }, // Manual input
    ];

    /**
     * NEW FUNCTION: Removes the third (altitude) value from GeoJSON coordinates.
     * @param {object} geometry - The original GeoJSON geometry.
     * @returns {object} The cleaned GeoJSON geometry with only 2D coordinates.
     */
    function cleanGeometry(geometry) {
        if (geometry.type === 'Polygon') {
            // Loop through each ring of the polygon (the first is the outer boundary)
            geometry.coordinates = geometry.coordinates.map(ring => {
                // Loop through each point in the ring and keep only the first two values (lon, lat)
                return ring.map(point => [point[0], point[1]]);
            });
        }
        return geometry;
    }

    function handleKmlUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        fileNameDisplay.textContent = file.name;
        fileNameContainer.classList.remove('hidden');
        
        resultsSection.classList.remove('hidden');
        resultsSection.style.opacity = '1';
        resultsContent.classList.add('hidden');
        loader.classList.remove('hidden');
        errorMessage.classList.add('hidden');

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const kmlDom = new DOMParser().parseFromString(e.target.result, 'text/xml');
                const geoJson = toGeoJSON.kml(kmlDom);
                const polygonFeature = geoJson.features.find(f => f.geometry && f.geometry.type === 'Polygon');

                if (polygonFeature) {
                    // --- CHANGE HERE: Clean the geometry before sending ---
                    const cleanedGeometry = cleanGeometry(polygonFeature.geometry);
                    analyzeGeometry(cleanedGeometry);
                } else {
                    throw new Error('No polygon found in the KML file.');
                }
            } catch (error) {
                displayError('Could not parse KML. Please ensure it contains a valid polygon.');
            }
        };
        reader.readAsText(file);
    }

    async function analyzeGeometry(geometry) {
        const apiUrl = 'http://localhost:3001/api/analyze';
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geometry }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const results = await response.json();
            displayResults(results);

        } catch (error) {
            displayError(`Analysis failed: ${error.message}`);
        }
    }

    function displayError(message) {
        loader.classList.add('hidden');
        resultsContent.classList.add('hidden');
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function calculateScore(value, { thresholds, higherIsBetter }) {
        if (value === null || value === undefined) return 0;
        const { best, worst } = thresholds;
        if (higherIsBetter) {
            if (value >= best) return 10;
            if (value <= worst) return 1;
            return 1 + 9 * ((value - worst) / (best - worst));
        } else {
            if (value <= best) return 10;
            if (value >= worst) return 1;
            return 1 + 9 * ((worst - value) / (worst - best));
        }
    }

    function displayResults(rawData) {
        decisionMatrixBody.innerHTML = '';
        suggestionsList.innerHTML = '';
        let totalWeightedScore = 0;
        let suggestions = [];

        parametersConfig.forEach(param => {
            let rawValue = rawData[param.key];
            let score = 0;

            // Handle special cases first
            if (param.key === 'landOwnership') {
                rawValue = parseInt(landOwnershipSelect.value, 10);
                score = (rawValue === 1) ? 10 : 5;
            } else if (param.key === 'elevation') {
                score = (rawValue >= 50 && rawValue <= 1500) ? 10 : 2;
            } else if (param.key === 'landCover') {
                // ESA Codes: 10=Trees, 20=Shrub, 30=Grass, 40=Crop, 50=Built-up, 60=Bare
                const goodCodes = [30, 40, 60];
                score = goodCodes.includes(rawValue) ? 10 : 3;
            } else {
                score = calculateScore(rawValue, param);
            }

            const weightedScore = score * param.weight;
            totalWeightedScore += weightedScore;

            if (score < 5 && param.suggestion) {
                suggestions.push(param.suggestion);
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">${param.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${rawValue !== null && rawValue !== undefined ? Number(rawValue).toFixed(2) : 'N/A'}${param.unit || ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-bold">${score.toFixed(1)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${(param.weight * 100).toFixed(0)}%</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-bold">${weightedScore.toFixed(2)}</td>
            `;
            decisionMatrixBody.appendChild(row);
        });

        // Update summary
        finalScoreDisplay.textContent = totalWeightedScore.toFixed(2);
        let decision = '';
        let decisionColor = '';
        let decisionIcon = '';

        if (totalWeightedScore >= 7) {
            decision = 'Yes';
            decisionColor = 'text-green-600';
            decisionIcon = '<i data-lucide="check-circle-2" class="w-10 h-10"></i>';
        } else if (totalWeightedScore >= 5) {
            decision = 'Review';
            decisionColor = 'text-amber-600';
            decisionIcon = '<i data-lucide="alert-triangle" class="w-10 h-10"></i>';
        } else {
            decision = 'No';
            decisionColor = 'text-red-600';
            decisionIcon = '<i data-lucide="x-circle" class="w-10 h-10"></i>';
        }
        decisionResultDisplay.innerHTML = `${decisionIcon}<span>${decision}</span>`;
        decisionResultDisplay.className = `text-5xl font-bold my-2 flex items-center justify-center gap-3 ${decisionColor}`;

        // Update suggestions
        if (suggestions.length > 0) {
            suggestions.forEach(s => {
                const li = document.createElement('li');
                li.textContent = s;
                suggestionsList.appendChild(li);
            });
        } else {
            suggestionsList.innerHTML = '<li>Excellent site! No major concerns identified based on the parameters.</li>';
        }

        // Show results
        loader.classList.add('hidden');
        resultsContent.classList.remove('hidden');
        lucide.createIcons(); // Re-render icons
    }
});
