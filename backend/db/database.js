/**
 * Database initialization and management using lowdb
 * Optimized for time-series vitals data storage
 */

const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const fs = require('fs');

// Ensure db directory exists
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'vitals.json');
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, {});

/**
 * Initialize database with default structure
 */
async function initDatabase() {
  await db.read();
  
  // Ensure required keys exist even if the JSON file was empty or partially written
  if (!db.data || typeof db.data !== "object") db.data = {};
  if (!Array.isArray(db.data.vitals)) db.data.vitals = [];
  if (!db.data.metadata) {
    db.data.metadata = {
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalReadings: 0,
    };
  }
  
  await db.write();
  console.log('✅ Database initialized at:', dbPath);
}

/**
 * Save a vitals reading to the database
 * @param {Object} reading - Vitals reading object
 * @returns {Object} Saved reading with auto-generated ID
 */
async function saveReading(reading) {
  await db.read();
  
  // Generate unique ID
  const id = `reading_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create reading object with validation
  const vitalRecord = {
    id,
    deviceId: reading.deviceId || 'unknown',
    timestamp: reading.timestamp || new Date().toISOString(),
    hr: validateNumber(reading.hr),
    spo2: validateNumber(reading.spo2),
    sbp: validateNumber(reading.sbp),
    dbp: validateNumber(reading.dbp),
    mean_bp: validateNumber(reading.mean_bp),
    blood_sugar: validateNumber(reading.blood_sugar),
    heart_rate_type: reading.heart_rate_type || null,
    heart_rate_type_confidence: validateNumber(reading.heart_rate_type_confidence),
    
    // Store arrays only if they have meaningful data
    ecg: Array.isArray(reading.ecg) && reading.ecg.length > 0 ? reading.ecg : null,
    ppg: Array.isArray(reading.ppg) && reading.ppg.length > 0 ? reading.ppg : null,
    
    // Metadata
    savedAt: new Date().toISOString()
  };
  
  // Add to vitals array (guard against missing array if db file was corrupted / empty)
  if (!Array.isArray(db.data.vitals)) db.data.vitals = [];
  db.data.vitals.push(vitalRecord);
  
  // Update metadata
  db.data.metadata.lastUpdated = new Date().toISOString();
  db.data.metadata.totalReadings = db.data.vitals.length;
  
  // Write to disk
  await db.write();
  
  console.log(`💾 Saved reading: ${id} (Total: ${db.data.metadata.totalReadings})`);
  return vitalRecord;
}

/**
 * Get recent vitals within specified time range
 * @param {number} minutes - Number of minutes to look back (default: 5)
 * @param {string} deviceId - Optional device ID filter
 * @returns {Array} Array of vitals readings
 */
async function getRecentVitals(minutes = 5, deviceId = null) {
  await db.read();
  
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
  
  // Filter readings by time and optionally by deviceId
  let readings = db.data.vitals.filter(reading => {
    const readingTime = new Date(reading.timestamp);
    const isWithinTimeRange = readingTime >= cutoffTime;
    const matchesDevice = !deviceId || reading.deviceId === deviceId;
    return isWithinTimeRange && matchesDevice;
  });
  
  // Sort by timestamp (newest first)
  readings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  console.log(`📊 Retrieved ${readings.length} readings from last ${minutes} minutes`);
  return readings;
}

/**
 * Get vitals by time range
 * @param {Date|string} startTime - Start time
 * @param {Date|string} endTime - End time
 * @param {string} deviceId - Optional device ID filter
 * @returns {Array} Array of vitals readings
 */
async function getVitalsByTimeRange(startTime, endTime, deviceId = null) {
  await db.read();
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  let readings = db.data.vitals.filter(reading => {
    const readingTime = new Date(reading.timestamp);
    const isWithinTimeRange = readingTime >= start && readingTime <= end;
    const matchesDevice = !deviceId || reading.deviceId === deviceId;
    return isWithinTimeRange && matchesDevice;
  });
  
  // Sort by timestamp (oldest first for time range queries)
  readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  return readings;
}

/**
 * Get latest reading for a device
 * @param {string} deviceId - Device ID
 * @returns {Object|null} Latest reading or null
 */
async function getLatestReading(deviceId = null) {
  await db.read();
  
  let readings = db.data.vitals;
  if (deviceId) {
    readings = readings.filter(r => r.deviceId === deviceId);
  }
  
  if (readings.length === 0) return null;
  
  // Sort and return most recent
  readings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return readings[0];
}

/**
 * Clean up old readings (optional - for data retention policy)
 * @param {number} daysToKeep - Number of days of data to retain
 * @returns {number} Number of readings deleted
 */
async function cleanOldReadings(daysToKeep = 30) {
  await db.read();
  
  const cutoffTime = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const initialCount = db.data.vitals.length;
  
  db.data.vitals = db.data.vitals.filter(reading => {
    const readingTime = new Date(reading.timestamp);
    return readingTime >= cutoffTime;
  });
  
  const deletedCount = initialCount - db.data.vitals.length;
  
  if (deletedCount > 0) {
    db.data.metadata.totalReadings = db.data.vitals.length;
    await db.write();
    console.log(`🗑️  Cleaned ${deletedCount} old readings (keeping ${daysToKeep} days)`);
  }
  
  return deletedCount;
}

/**
 * Get database statistics
 * @returns {Object} Database stats
 */
async function getStats() {
  await db.read();
  
  const now = new Date();
  const last24h = db.data.vitals.filter(r => 
    new Date(r.timestamp) >= new Date(now - 24 * 60 * 60 * 1000)
  ).length;
  
  const last1h = db.data.vitals.filter(r => 
    new Date(r.timestamp) >= new Date(now - 60 * 60 * 1000)
  ).length;
  
  const devices = [...new Set(db.data.vitals.map(r => r.deviceId))];
  
  return {
    totalReadings: db.data.vitals.length,
    last24Hours: last24h,
    lastHour: last1h,
    devices: devices.length,
    deviceIds: devices,
    oldestReading: db.data.vitals.length > 0 
      ? db.data.vitals.reduce((oldest, r) => 
          new Date(r.timestamp) < new Date(oldest.timestamp) ? r : oldest
        ).timestamp 
      : null,
    newestReading: db.data.vitals.length > 0
      ? db.data.vitals.reduce((newest, r) => 
          new Date(r.timestamp) > new Date(newest.timestamp) ? r : newest
        ).timestamp
      : null
  };
}

/**
 * Helper function to validate and normalize numbers
 */
function validateNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

module.exports = {
  initDatabase,
  saveReading,
  getRecentVitals,
  getVitalsByTimeRange,
  getLatestReading,
  cleanOldReadings,
  getStats,
  db
};
