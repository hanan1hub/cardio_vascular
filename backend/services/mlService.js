// services/mlService.js
// ─────────────────────────────────────────────────────────────────────────────
// Two ML services:
//   1. BP prediction  (port 5001) — CNN-BiLSTM on PPG+ECG arrays
//   2. PCG prediction (port 5002) — Conv1D on WAV heart sound files
//
// PCG NOTE: The PCG model was trained on WAV audio files processed through
// MFCC feature extraction. It cannot accept raw ECG/PPG arrays directly.
// For now, predictions use WAV files from the data/ folder.
// When you add a real microphone to your hardware, switch to /predict-signal.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");
const path  = require("path");
const fs    = require("fs");

const ML_MODEL_URL  = process.env.ML_MODEL_URL;   // http://localhost:5001/predict
const PCG_MODEL_URL = process.env.PCG_MODEL_URL;  // http://localhost:5002

// ── Helper ────────────────────────────────────────────────────────────────────
function isPcgUrlConfigured() {
  return (
    PCG_MODEL_URL &&
    typeof PCG_MODEL_URL === "string" &&
    PCG_MODEL_URL.startsWith("http")
  );
}

function isBpUrlConfigured() {
  return (
    ML_MODEL_URL &&
    typeof ML_MODEL_URL === "string" &&
    ML_MODEL_URL.startsWith("http")
  );
}

// Strip any trailing /predict so we can append the right path ourselves
function pcgBaseUrl() {
  return PCG_MODEL_URL.replace(/\/predict$/, "");
}

// ── BP Prediction ─────────────────────────────────────────────────────────────
function padOrTruncate(arr, targetLength) {
  if (arr.length === 0) return new Array(targetLength).fill(0);
  if (arr.length > targetLength) return arr.slice(0, targetLength);
  const padValue = arr[arr.length - 1] || 0;
  return [...arr, ...new Array(targetLength - arr.length).fill(padValue)];
}

function normalizeMinMax(arr) {
  const min   = Math.min(...arr);
  const max   = Math.max(...arr);
  const range = max - min;
  if (range === 0) return arr.map(() => 0);
  return arr.map(val => (val - min) / range);
}

function normalizeZScore(arr) {
  const mean     = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
  const std      = Math.sqrt(variance) + 1e-8;
  return arr.map(val => (val - mean) / (std * 2));
}

function preprocessBpData(sensorData) {
  const REQUIRED_LENGTH = 125;
  let ppg = padOrTruncate(sensorData.ppg || [], REQUIRED_LENGTH);
  let ecg = padOrTruncate(sensorData.ecg || [], REQUIRED_LENGTH);
  ppg = normalizeMinMax(ppg);
  ecg = normalizeZScore(ecg);
  return { ppg, ecg };
}

async function predictBP(sensorData) {
  if (!isBpUrlConfigured()) {
    console.log("⚠️  ML_MODEL_URL not configured, skipping BP prediction");
    return null;
  }

  try {
    const { ppg, ecg } = preprocessBpData(sensorData);

    const response = await axios.post(
      ML_MODEL_URL,
      { ppg, ecg },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    console.log("✅ BP model response:", response.data);
    return {
      mean_bp: response.data.mean_bp || response.data.bp || response.data.prediction
    };
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("❌ BP prediction failed: ML model not running on", ML_MODEL_URL);
    } else {
      console.error("❌ BP prediction failed:", error.message);
    }
    return null;
  }
}

// ── PCG Prediction ────────────────────────────────────────────────────────────
//
// Strategy:
//   - Pick a WAV file from the data/ folder that matches the current session
//     (for now: random file, or the most recently used one).
//   - In the future, when you have a real microphone, call /predict-signal
//     with the actual PCG audio buffer instead.
//
// The PCG model classifies heart sounds into:
//   AS  = Aortic Stenosis
//   MR  = Mitral Regurgitation
//   MS  = Mitral Stenosis
//   MVP = Mitral Valve Prolapse
//   N   = Normal

// Track which WAV files are available
let availableWavFiles = null;

function getAvailableWavFiles() {
  if (availableWavFiles !== null) return availableWavFiles;

  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) {
    console.warn("⚠️  data/ folder not found for PCG prediction");
    availableWavFiles = [];
    return availableWavFiles;
  }

  availableWavFiles = fs
    .readdirSync(dataDir)
    .filter(f => f.toLowerCase().endsWith(".wav"))
    .sort();

  console.log(`📁 Found ${availableWavFiles.length} WAV files for PCG prediction`);
  return availableWavFiles;
}

// Keep track of which file index to use (cycles through all files)
let wavFileIndex = 0;

async function predictHeartSoundType(wavFilename) {
  /**
   * Predict heart sound type from a specific WAV file.
   * @param {string} wavFilename - filename like "156_AS.wav"
   * @returns {Object|null} prediction result
   */
  if (!isPcgUrlConfigured()) {
    console.log("⚠️  PCG_MODEL_URL not configured, skipping PCG prediction");
    return null;
  }

  const url = `${pcgBaseUrl()}/predict`;

  try {
    console.log(`📤 PCG predict: ${wavFilename} → ${url}`);

    const response = await axios.post(
      url,
      { filename: wavFilename },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );

    const data = response.data;

    if (data && data.heart_sound_type) {
      console.log(
        `💓 PCG result: ${data.heart_sound_type} ` +
        `(confidence=${(data.confidence * 100).toFixed(1)}%)`
      );
      return {
        heart_rate_type:            data.heart_sound_type,   // kept as heart_rate_type for frontend compat
        heart_sound_type:           data.heart_sound_type,
        confidence:                 data.confidence || 0,
        class_index:                data.class_index ?? 0,
        all_probabilities:          data.details?.all_probabilities || {},
        source_file:                wavFilename,
      };
    }
    return null;

  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("❌ PCG prediction failed: service not running on", PCG_MODEL_URL);
    } else {
      console.error("❌ PCG prediction failed:", error.message);
    }
    return null;
  }
}

async function predictHeartRateType(sensorData) {
  /**
   * Called from server.js for each incoming sensor reading.
   *
   * Mode A (preferred): real INMP441 PCG data from ESP32
   *   - sensorData.pcg must have ≥ 500 samples
   *   - sends to /predict-signal with source="esp32" so the server applies
   *     the INMP441 spectral correction curve before MFCC extraction
   *
   * Mode B (fallback): WAV files from data/ folder (demo/offline mode)
   *   - used when no real PCG data is present in the payload
   *
   * NOTE: ECG arrays must NOT be used as PCG input — they are completely
   *       different signal types (electrical vs acoustic).
   */

  if (!isPcgUrlConfigured()) return null;

  // ── Mode A: real INMP441 PCG data from ESP32 ─────────────────────────────
  if (sensorData.pcg && sensorData.pcg.length >= 500) {
    const url = `${pcgBaseUrl()}/predict-signal`;
    try {
      console.log(
        `📤 PCG real-signal predict: ${sensorData.pcg.length} samples ` +
        `@ ${sensorData.pcg_sample_rate || 2000} Hz → ${url}`
      );

      const response = await axios.post(
        url,
        {
          pcg:         sensorData.pcg,
          sample_rate: sensorData.pcg_sample_rate || 2000,
          source:      "esp32",          // triggers INMP441 correction in pcg_server.py
        },
        { headers: { "Content-Type": "application/json" }, timeout: 20000 }
      );

      const data = response.data;
      if (data && data.heart_sound_type) {
        console.log(
          `💓 PCG result (real signal): ${data.heart_sound_type} ` +
          `(confidence=${(data.confidence * 100).toFixed(1)}%)`
        );
        return {
          heart_rate_type:   data.heart_sound_type,
          heart_sound_type:  data.heart_sound_type,
          confidence:        data.confidence || 0,
          class_index:       data.class_index ?? 0,
          all_probabilities: data.details?.all_probabilities || {},
          source_file:       "esp32_inmp441",
        };
      }
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        console.error("❌ PCG real-signal prediction failed: service not running on", PCG_MODEL_URL);
      } else {
        console.error("❌ PCG real-signal prediction failed:", error.message);
      }
      // fall through to WAV fallback
    }
  }

  // ── Mode B: WAV file fallback ──────────────────────────────────────────────
  const files = getAvailableWavFiles();
  if (files.length === 0) {
    console.warn("⚠️  No WAV files available for PCG fallback prediction");
    return null;
  }

  // Cycle through files so each reading gets a prediction from a different file
  const filename = files[wavFileIndex % files.length];
  wavFileIndex++;

  console.log(`📁 PCG fallback: using WAV file "${filename}"`);
  return await predictHeartSoundType(filename);
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  predictBP,
  predictHeartRateType,
  predictHeartSoundType,   // export for direct use in new route
  getAvailableWavFiles,
};