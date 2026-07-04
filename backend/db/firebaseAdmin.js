/**
 * db/firebaseAdmin.js
 * Firebase Admin SDK initialization.
 * Used by the backend to write sensor readings directly to Firestore.
 */

const admin = require("firebase-admin");
const path  = require("path");
const fs    = require("fs");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "..", "serviceAccountKey.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.warn("⚠️  Firebase disabled: serviceAccountKey.json not found at:", SERVICE_ACCOUNT_PATH);
  console.warn("   To enable Firestore, download it from Firebase Console → Project Settings → Service Accounts");

  module.exports = {
    firestore: null,
    admin: null,
    saveSensorReading: async () => null,
    getPatientReadings: async () => [],
    getLatestPatientReading: async () => null,
  };
  return;
}

// Only initialize once (guard against hot-reload double init)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
  });
  console.log("✅ Firebase Admin initialized");
}

const firestore = admin.firestore();

// ── Firestore helpers ─────────────────────────────────────────────────────────

/**
 * Save a sensor reading to Firestore.
 * Collection: sensorReadings
 * Document ID: auto-generated
 */
async function saveSensorReading(reading) {
  try {
    const docRef = await firestore.collection("sensorReadings").add({
      ...reading,
      savedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`🔥 Firestore saved: ${docRef.id} (patient: ${reading.patientId || "unlinked"})`);
    return docRef.id;
  } catch (err) {
    console.error("❌ Firestore save failed:", err.message);
    return null;
  }
}

/**
 * Get recent sensor readings for a specific patient.
 * @param {string} patientId - Firebase UID of the patient
 * @param {number} limitCount - Max number of readings to return
 */
async function getPatientReadings(patientId, limitCount = 20) {
  try {
    const snap = await firestore
      .collection("sensorReadings")
      .where("patientId", "==", patientId)
      .orderBy("timestamp", "desc")
      .limit(limitCount)
      .get();

    const readings = [];
    snap.forEach(doc => readings.push({ id: doc.id, ...doc.data() }));
    return readings;
  } catch (err) {
    console.error("❌ Firestore read failed:", err.message);
    return [];
  }
}

/**
 * Get the latest single reading for a patient.
 */
async function getLatestPatientReading(patientId) {
  try {
    const snap = await firestore
      .collection("sensorReadings")
      .where("patientId", "==", patientId)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.error("❌ Firestore getLatest failed:", err.message);
    return null;
  }
}

module.exports = {
  firestore,
  admin,
  saveSensorReading,
  getPatientReadings,
  getLatestPatientReading,
};