// Import the Google Earth Engine library
const ee = require('@google/earthengine');

/**
 * Main analysis function that calculates GEE-specific parameters.
 * Note: Roads and Seismic data are now handled by the server.
 * @param {object} geometry - The GeoJSON geometry (polygon) of the area of interest.
 * @returns {Promise<object>} A promise that resolves to an object containing GEE-calculated raw values.
 */
const performAnalysis = (geometry) => {
  return new Promise((resolve, reject) => {
    try {
      const aoi = ee.Geometry(geometry);

      const end = ee.Date(Date.now());
      const start = end.advance(-1, 'year');

      const dem = ee.Image('USGS/SRTMGL1_003');
      const slope = ee.Terrain.slope(dem);
      const ghi = ee.Image('projects/earthengine-legacy/assets/projects/sat-io/open-datasets/global_solar_atlas/ghi_LTAy_AvgDailyTotals');
      const lst = ee.ImageCollection('MODIS/061/MOD11A2').filterDate(start, end).select('LST_Day_1km').mean().multiply(0.02).subtract(273.15);
      const landCover = ee.Image('ESA/WorldCover/v100/2020').select('Map');
      const hillshade = ee.Terrain.hillshade(dem);
      const aerosol = ee.ImageCollection('MODIS/061/MCD19A2_GRANULES').filterDate(start, end).select('Optical_Depth_055').mean();
      const era5 = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY').filterDate(start, end).select(['u_component_of_wind_10m', 'v_component_of_wind_10m']);
      const windSpeed = era5.map(image => image.pow(2).reduce(ee.Reducer.sum()).sqrt()).mean();
      
      const powerLines = ee.FeatureCollection("WRI/GPPD/power_plants");
      const distanceToGrid = powerLines.distance(100000, 100).divide(1000); // in km
      
      const rivers = ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers");
      const perennialRivers = rivers.filter(ee.Filter.eq('RIV_TC_V1C', 1));
      const distanceToWater = perennialRivers.distance(50000, 50).divide(1000); // in km

      const soilBulkDensity = ee.Image("projects/soilgrids-isric/bdod_mean").select('bdod_0-5cm_mean').rename('soilStability');
      
      const surfaceWater = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence');
      const floodProneArea = surfaceWater.gt(50);
      const floodRiskHectares = floodProneArea.multiply(ee.Image.pixelArea()).divide(10000)
                                 .reduceRegion({ reducer: ee.Reducer.sum(), geometry: aoi, scale: 30, maxPixels: 1e9 });

      const combinedImage = dem.rename('elevation')
        .addBands(slope.rename('slope'))
        .addBands(ghi.rename('ghi'))
        .addBands(lst.rename('temperature'))
        .addBands(landCover.rename('landCover'))
        .addBands(hillshade.rename('shading'))
        .addBands(aerosol.rename('dust'))
        .addBands(windSpeed.rename('windSpeed'))
        .addBands(distanceToGrid.rename('distanceToGrid'))
        .addBands(distanceToWater.rename('distanceToWater'))
        .addBands(soilBulkDensity);

      const reducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.mode(), sharedInputs: true });

      const stats = combinedImage.reduceRegion({ reducer, geometry: aoi, scale: 100, maxPixels: 1e10 });

      ee.Dictionary({ floodRisk: floodRiskHectares.get('occurrence') }).evaluate((floodData, floodError) => {
          if (floodError) return reject('Error calculating flood risk.');
          
          stats.evaluate((data, error) => {
            if (error) return reject(`An error occurred during the GEE analysis: ${error}`);
            
            const finalResults = {
                slope: data.slope_mean,
                ghi: data.ghi_mean,
                temperature: data.temperature_mean,
                elevation: data.elevation_mean,
                landCover: data.landCover_mode,
                shading: data.shading_mean,
                dust: data.dust_mean,
                windSpeed: data.windSpeed_mean * 3.6,
                proximityToLines: data.distanceToGrid_mean,
                waterAvailability: data.distanceToWater_mean,
                soilStability: data.soilStability_mean,
                floodRisk: floodData.floodRisk,
            };
            resolve(finalResults);
          });
      });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { performAnalysis };
