/**
 * Validation middleware for API requests
 */

/**
 * Validate incoming sensor readings from ESP32
 */
function validateSensorReading(req, res, next) {
  const { body } = req;
  
  // Check if body exists
  if (!body || Object.keys(body).length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'Request body is required',
      details: 'ESP32 must send sensor data in JSON format'
    });
  }
  
  // Validation warnings (not blocking)
  const warnings = [];
  
  // Validate deviceId
  if (!body.deviceId) {
    warnings.push('deviceId is missing - will use default');
  }
  
  // Validate heart rate
  if (body.hr !== null && body.hr !== undefined) {
    const hr = Number(body.hr);
    if (isNaN(hr)) {
      warnings.push('Heart rate (hr) is not a valid number');
    } else if (hr < 0 || hr > 300) {
      warnings.push(`Heart rate ${hr} is outside normal range (0-300)`);
    }
  }
  
  // Validate SpO2
  if (body.spo2 !== null && body.spo2 !== undefined) {
    const spo2 = Number(body.spo2);
    if (isNaN(spo2)) {
      warnings.push('SpO2 is not a valid number');
    } else if (spo2 < 0 || spo2 > 100) {
      warnings.push(`SpO2 ${spo2} is outside normal range (0-100)`);
    }
  }
  
  // Validate blood pressure
  if (body.sbp !== null && body.sbp !== undefined) {
    const sbp = Number(body.sbp);
    if (isNaN(sbp)) {
      warnings.push('Systolic BP (sbp) is not a valid number');
    } else if (sbp < 50 || sbp > 250) {
      warnings.push(`Systolic BP ${sbp} is outside normal range (50-250)`);
    }
  }
  
  if (body.dbp !== null && body.dbp !== undefined) {
    const dbp = Number(body.dbp);
    if (isNaN(dbp)) {
      warnings.push('Diastolic BP (dbp) is not a valid number');
    } else if (dbp < 30 || dbp > 150) {
      warnings.push(`Diastolic BP ${dbp} is outside normal range (30-150)`);
    }
  }
  
  // Validate ECG array
  if (body.ecg !== undefined && body.ecg !== null) {
    if (!Array.isArray(body.ecg)) {
      warnings.push('ECG data should be an array');
    } else if (body.ecg.length > 1000) {
      warnings.push(`ECG array is very large (${body.ecg.length} values) - consider reducing size`);
    }
  }
  
  // Validate PPG array
  if (body.ppg !== undefined && body.ppg !== null) {
    if (!Array.isArray(body.ppg)) {
      warnings.push('PPG data should be an array');
    } else if (body.ppg.length > 1000) {
      warnings.push(`PPG array is very large (${body.ppg.length} values) - consider reducing size`);
    }
  }
  
  // Attach warnings to request for logging
  req.validationWarnings = warnings;
  
  // Continue to next middleware
  next();
}

/**
 * Validate query parameters for recent vitals endpoint
 */
function validateRecentVitalsQuery(req, res, next) {
  const { minutes, deviceId } = req.query;
  
  // Validate minutes parameter
  if (minutes !== undefined) {
    const minutesNum = Number(minutes);
    if (isNaN(minutesNum) || minutesNum <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid minutes parameter',
        details: 'Minutes must be a positive number'
      });
    }
    if (minutesNum > 1440) { // 24 hours
      return res.status(400).json({
        ok: false,
        error: 'Minutes parameter too large',
        details: 'Maximum supported range is 1440 minutes (24 hours)'
      });
    }
  }
  
  // Validate deviceId if provided
  if (deviceId !== undefined && typeof deviceId !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Invalid deviceId parameter',
      details: 'deviceId must be a string'
    });
  }
  
  next();
}

/**
 * Validate send-to-doctor request body
 */
function validateSendToDoctor(req, res, next) {
  const { deviceId, minutes, format, email } = req.body;
  
  // Validate format
  if (format && !['json', 'pdf', 'email'].includes(format)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid format parameter',
      details: 'Format must be one of: json, pdf, email'
    });
  }
  
  // If format is email, email address is required
  if (format === 'email' && !email) {
    return res.status(400).json({
      ok: false,
      error: 'Email address required',
      details: 'When format is "email", an email address must be provided'
    });
  }
  
  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email address',
        details: 'Please provide a valid email address'
      });
    }
  }
  
  // Validate minutes if provided
  if (minutes !== undefined) {
    const minutesNum = Number(minutes);
    if (isNaN(minutesNum) || minutesNum <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid minutes parameter',
        details: 'Minutes must be a positive number'
      });
    }
  }
  
  next();
}

module.exports = {
  validateSensorReading,
  validateRecentVitalsQuery,
  validateSendToDoctor
};
