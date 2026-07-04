// services/serialService.js
// ─────────────────────────────────────────────────────────────────────────────
// Manages USB serial communication with the ESP32.
//
// ESP32 modes (set by your existing Arduino sketch):
//   Mode 1 (default) — PCG: streams raw 16-bit I2S audio at 16 000 Hz
//   Mode 2           — PPG: triggered by "PPG_REC\n", streams "D:IR,Red\n" lines
//
// Recording is triggered by the dashboard buttons and results are pushed
// back to the frontend via Socket.IO events:
//   recording_status   { type, status, message, duration? }
//   recording_progress { type, progress, elapsed, remaining, samples? }
//   recording_result   { type, ...prediction fields }
// ─────────────────────────────────────────────────────────────────────────────

const { SerialPort }    = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const axios             = require("axios");

// ── Config ────────────────────────────────────────────────────────────────────
const PCG_SAMPLE_RATE = 16000;       // Hz — matches ESP32 i2s_config.sample_rate
const PCG_RECORD_SECS = 15;          // seconds of heart sound to capture (model uses 3s internally)
const PCG_SEND_SECS   = 10;          // seconds to send to the model (enough for MFCC)
const PPG_RECORD_SECS = 45;          // seconds of PPG to capture (yields ~4 windows, good accuracy)

let isRecording = false;

function getComPort()  {
  return process.env.ESP32_COM_PORT || process.env.ESP_32_COM_PORT || "COM3";
}
function getPcgBase()  { return (process.env.PCG_MODEL_URL || "http://localhost:5002/predict").replace(/\/predict$/, ""); }
function getPpgUrl()   { return process.env.PPG_BP_URL     || "http://localhost:5003"; }

// ── Serial helpers ────────────────────────────────────────────────────────────
function openPort(comPort, baudRate = 921600) {
  return new Promise((resolve, reject) => {
    const p = new SerialPort({ path: comPort, baudRate, autoOpen: false });
    p.open(err => {
      if (err) reject(new Error(`Cannot open ${comPort}: ${err.message}. Make sure Arduino Serial Monitor is CLOSED.`));
      else resolve(p);
    });
  });
}

function closePort(p) {
  return new Promise(resolve => {
    if (!p || !p.isOpen) return resolve();
    p.close(() => resolve());
  });
}

// ── PCG recording ─────────────────────────────────────────────────────────────
// Reads raw 16-bit I2S samples, normalises, sends to pcg_server /predict-signal
async function recordPCG(io) {
  if (isRecording) throw new Error("Another recording is already in progress.");
  isRecording = true;
  const comPort = getComPort();
  let port = null;

  try {
    io.emit("recording_status", {
      type: "pcg", status: "started",
      message: `Opening ${comPort} and recording heart sound for ${PCG_RECORD_SECS} s…`,
      duration: PCG_RECORD_SECS,
    });

    port = await openPort(comPort);

    // Command ESP32 to start PCG streaming mode (new firmware). If the ESP32 is
    // running older firmware that streams PCG by default, this is harmless.
    await new Promise((resolve, reject) => {
      port.write("PCG_REC\n", err => err ? reject(err) : resolve());
    });

    // Discard first 500 ms (buffer stabilisation)
    await new Promise(r => setTimeout(r, 500));

    const chunks   = [];
    const startMs  = Date.now();
    const targetMs = PCG_RECORD_SECS * 1000;

    await new Promise((resolve, reject) => {
      port.on("data", chunk => {
        const elapsed = Date.now() - startMs;
        chunks.push(chunk);

        // Emit progress every ~2 seconds worth of data
        const bytesPer2s = PCG_SAMPLE_RATE * 2 * 2;
        const totalBytes = chunks.reduce((s, c) => s + c.length, 0);
        if (totalBytes % bytesPer2s < chunk.length) {
          const elapsedSec = Math.round(elapsed / 1000);
          io.emit("recording_progress", {
            type: "pcg",
            progress:   Math.min(100, Math.round((elapsed / targetMs) * 100)),
            elapsed:    elapsedSec,
            remaining:  Math.max(0, PCG_RECORD_SECS - elapsedSec),
          });
        }

        if (elapsed >= targetMs) {
          port.removeAllListeners("data");
          resolve();
        }
      });

      port.on("error", reject);
      setTimeout(resolve, targetMs + 3000);   // hard timeout
    });

    await closePort(port);
    port = null;

    io.emit("recording_status", { type: "pcg", status: "processing", message: "Running heart sound AI…" });

    // Build int16 samples
    const rawBuf  = Buffer.concat(chunks);
    const nTotal  = Math.floor(rawBuf.length / 2);
    let   maxAbs  = 1;
    const allSamples = new Array(nTotal);

    for (let i = 0; i < nTotal; i++) {
      allSamples[i] = rawBuf.readInt16LE(i * 2);
      if (Math.abs(allSamples[i]) > maxAbs) maxAbs = Math.abs(allSamples[i]);
    }

    // Take middle PCG_SEND_SECS seconds (most stable portion, avoids start/end noise)
    const sendLen   = PCG_SAMPLE_RATE * PCG_SEND_SECS;
    const midStart  = Math.max(0, Math.floor((nTotal - sendLen) / 2));
    const slice     = allSamples.slice(midStart, midStart + sendLen);
    const pcgFloat  = slice.map(s => s / maxAbs);

    console.log(`📤 PCG: sending ${pcgFloat.length} samples (${PCG_SEND_SECS}s) to ${getPcgBase()}/predict-signal`);

    const resp = await axios.post(`${getPcgBase()}/predict-signal`, {
      pcg:         pcgFloat,
      sample_rate: PCG_SAMPLE_RATE,
      source:      "esp32",
    }, { timeout: 30000 });

    const result = {
      type:             "pcg",
      heart_sound_type: resp.data.heart_sound_type,
      confidence:       resp.data.confidence,
      all_probabilities: resp.data.details?.all_probabilities || {},
      timestamp:        new Date().toISOString(),
      samples_recorded: nTotal,
      duration_sec:     Math.round(nTotal / PCG_SAMPLE_RATE),
    };

    io.emit("recording_result", result);
    io.emit("recording_status", { type: "pcg", status: "done" });
    console.log(`💓 PCG result: ${result.heart_sound_type} (${(result.confidence * 100).toFixed(1)}%)`);
    return result;

  } catch (err) {
    console.error("❌ PCG recording error:", err.message);
    io.emit("recording_status", { type: "pcg", status: "error", message: err.message });
    throw err;
  } finally {
    if (port?.isOpen) await closePort(port);
    isRecording = false;
  }
}

// ── PPG recording ─────────────────────────────────────────────────────────────
// Sends "PPG_REC\n" to switch ESP32 to Mode 2, reads IR/Red lines,
// sends normalised PPG to ppg_bp_server /predict
async function recordPPG(io) {
  if (isRecording) throw new Error("Another recording is already in progress.");
  isRecording = true;
  const comPort = getComPort();
  let port = null;

  try {
    io.emit("recording_status", {
      type: "ppg", status: "started",
      message: `Opening ${comPort} and recording PPG for ${PPG_RECORD_SECS} s…`,
      duration: PPG_RECORD_SECS,
    });

    port = await openPort(comPort);

    // Command ESP32 to enter PPG recording mode
    await new Promise((resolve, reject) => {
      port.write("PPG_REC\n", err => err ? reject(err) : resolve());
    });

    const irValues   = [];
    const redValues  = [];
    const timestamps = [];
    const startMs    = Date.now();
    const targetMs   = PPG_RECORD_SECS * 1000;

    const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

    await new Promise((resolve, reject) => {
      parser.on("data", line => {
        const elapsed    = Date.now() - startMs;
        const elapsedSec = elapsed / 1000;

        if (line.startsWith("D:")) {
          try {
            const parts = line.replace("D:", "").trim().split(",");
            const ir  = parseInt(parts[0], 10);
            const red = parseInt(parts[1], 10);
            if (!isNaN(ir) && !isNaN(red) && ir > 0) {
              irValues.push(ir);
              redValues.push(red);
              timestamps.push(elapsedSec);
            }
          } catch { /* ignore parse errors */ }
        }

        // Emit progress every 50 samples (~0.5 s at 100 Hz)
        if (irValues.length % 50 === 0) {
          io.emit("recording_progress", {
            type:      "ppg",
            progress:  Math.min(100, Math.round((elapsed / targetMs) * 100)),
            elapsed:   Math.round(elapsedSec),
            remaining: Math.max(0, PPG_RECORD_SECS - Math.round(elapsedSec)),
            samples:   irValues.length,
          });
        }

        if (elapsed >= targetMs) {
          parser.removeAllListeners("data");
          resolve();
        }
      });

      parser.on("error", reject);
      setTimeout(resolve, targetMs + 3000);
    });

    await closePort(port);
    port = null;

    if (irValues.length < 250) {
      throw new Error(
        `Only ${irValues.length} PPG samples collected (need ≥250). ` +
        `Check that your finger is on the MAX30102 sensor.`
      );
    }

    io.emit("recording_status", { type: "ppg", status: "processing", message: "Running blood pressure model…" });

    // Normalise PPG to [0, 1]
    const minIR  = Math.min(...irValues);
    const maxIR  = Math.max(...irValues);
    const rangeIR = maxIR - minIR || 1;
    const ppgNorm = irValues.map(v => (v - minIR) / rangeIR);

    // Estimate actual sample rate
    const totalSec  = timestamps[timestamps.length - 1] || PPG_RECORD_SECS;
    const sampleRate = Math.round(irValues.length / totalSec);

    console.log(`📤 PPG: ${irValues.length} samples @ ~${sampleRate} Hz → ${getPpgUrl()}/predict`);

    const resp = await axios.post(`${getPpgUrl()}/predict`, {
      ppg:         ppgNorm,
      sample_rate: sampleRate,
      timestamps:  timestamps,
    }, { timeout: 60000 });

    const result = {
      type:             "ppg",
      sbp:              resp.data.sbp,
      dbp:              resp.data.dbp,
      sbp_std:          resp.data.sbp_std,
      dbp_std:          resp.data.dbp_std,
      n_segments:       resp.data.n_segments,
      duration_sec:     resp.data.duration_sec,
      model_name:       resp.data.model_name,
      samples_recorded: irValues.length,
      timestamp:        new Date().toISOString(),
    };

    io.emit("recording_result", result);
    io.emit("recording_status", { type: "ppg", status: "done" });
    console.log(`🩺 PPG BP result: ${result.sbp?.toFixed(1)}/${result.dbp?.toFixed(1)} mmHg`);
    return result;

  } catch (err) {
    console.error("❌ PPG recording error:", err.message);
    io.emit("recording_status", { type: "ppg", status: "error", message: err.message });
    throw err;
  } finally {
    if (port?.isOpen) await closePort(port);
    isRecording = false;
  }
}

module.exports = {
  recordPCG,
  recordPPG,
  isRecordingActive: () => isRecording,
  getComPort,
};
