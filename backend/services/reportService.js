/**
 * Service for generating and sending medical reports
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate a formatted JSON report of vitals
 * @param {Array} vitals - Array of vital readings
 * @param {Object} options - Report options
 * @returns {Object} Formatted report
 */
function generateJsonReport(vitals, options = {}) {
  const { deviceId, minutes } = options;
  
  if (vitals.length === 0) {
    return {
      report_type: 'vitals_summary',
      generated_at: new Date().toISOString(),
      device_id: deviceId || 'all',
      time_range_minutes: minutes || 'N/A',
      total_readings: 0,
      message: 'No vitals data available for the specified time range'
    };
  }
  
  // Calculate statistics
  const stats = calculateVitalsStats(vitals);
  
  // Sort readings by timestamp
  const sortedVitals = vitals.sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );
  
  const report = {
    report_type: 'vitals_summary',
    generated_at: new Date().toISOString(),
    device_id: deviceId || 'all',
    time_range: {
      start: sortedVitals[0].timestamp,
      end: sortedVitals[sortedVitals.length - 1].timestamp,
      duration_minutes: minutes || calculateDurationMinutes(
        sortedVitals[0].timestamp, 
        sortedVitals[sortedVitals.length - 1].timestamp
      )
    },
    summary: {
      total_readings: vitals.length,
      ...stats
    },
    readings: sortedVitals.map(r => ({
      timestamp: r.timestamp,
      heart_rate: r.hr,
      spo2: r.spo2,
      blood_pressure: r.sbp && r.dbp ? `${r.sbp}/${r.dbp}` : null,
      mean_bp: r.mean_bp,
      blood_sugar: r.blood_sugar,
      // Include ECG/PPG metadata but not full arrays (too large)
      ecg_samples: r.ecg ? r.ecg.length : 0,
      ppg_samples: r.ppg ? r.ppg.length : 0
    })),
    notes: [
      'This is an automated vitals report',
      'BP values are ML-predicted and should be verified with clinical measurements',
      'Consult a healthcare professional for medical advice'
    ]
  };
  
  return report;
}

/**
 * Generate a text-based report suitable for email or display
 * @param {Array} vitals - Array of vital readings
 * @param {Object} options - Report options
 * @returns {string} Formatted text report
 */
function generateTextReport(vitals, options = {}) {
  const { deviceId, minutes } = options;
  
  if (vitals.length === 0) {
    return `
VITAL SIGNS REPORT
==================
Generated: ${new Date().toISOString()}
Device: ${deviceId || 'All devices'}
Time Range: Last ${minutes || 'N/A'} minutes

No vitals data available for the specified time range.
    `.trim();
  }
  
  const stats = calculateVitalsStats(vitals);
  const sortedVitals = vitals.sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );
  
  let report = `
VITAL SIGNS REPORT
==================
Generated: ${new Date().toISOString()}
Device: ${deviceId || 'All devices'}
Time Range: ${sortedVitals[0].timestamp} to ${sortedVitals[sortedVitals.length - 1].timestamp}
Total Readings: ${vitals.length}

SUMMARY STATISTICS
------------------
Heart Rate (HR):
  - Average: ${stats.hr_avg ? stats.hr_avg.toFixed(1) : 'N/A'} bpm
  - Range: ${stats.hr_min || 'N/A'} - ${stats.hr_max || 'N/A'} bpm

SpO2:
  - Average: ${stats.spo2_avg ? stats.spo2_avg.toFixed(1) : 'N/A'} %
  - Range: ${stats.spo2_min || 'N/A'} - ${stats.spo2_max || 'N/A'} %

Blood Pressure (Predicted):
  - Average SBP: ${stats.sbp_avg ? stats.sbp_avg.toFixed(1) : 'N/A'} mmHg
  - Average DBP: ${stats.dbp_avg ? stats.dbp_avg.toFixed(1) : 'N/A'} mmHg
  - Range: ${stats.sbp_min || 'N/A'}/${stats.dbp_min || 'N/A'} - ${stats.sbp_max || 'N/A'}/${stats.dbp_max || 'N/A'} mmHg

DETAILED READINGS
-----------------
`;
  
  sortedVitals.forEach((reading, index) => {
    const timestamp = new Date(reading.timestamp).toLocaleString();
    const hr = reading.hr !== null ? `${reading.hr} bpm` : 'N/A';
    const spo2 = reading.spo2 !== null ? `${reading.spo2}%` : 'N/A';
    const bp = reading.sbp && reading.dbp ? `${reading.sbp}/${reading.dbp} mmHg` : 'N/A';
    
    report += `\n${index + 1}. ${timestamp}
   HR: ${hr} | SpO2: ${spo2} | BP: ${bp}`;
  });
  
  report += `

NOTES
-----
- This is an automated vitals report
- BP values are ML-predicted and should be verified with clinical measurements
- Consult a healthcare professional for medical advice

End of Report
`;
  
  return report;
}

/**
 * Save report to file system (for download)
 * @param {Object|string} report - Report data
 * @param {string} format - File format (json or txt)
 * @param {string} deviceId - Device ID for filename
 * @returns {string} File path
 */
function saveReportToFile(report, format = 'json', deviceId = 'device') {
  // Create reports directory if it doesn't exist
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `vitals_report_${deviceId}_${timestamp}.${format === 'json' ? 'json' : 'txt'}`;
  const filepath = path.join(reportsDir, filename);
  
  const content = format === 'json' 
    ? JSON.stringify(report, null, 2)
    : report;
  
  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`📄 Report saved: ${filepath}`);
  
  return filepath;
}

/**
 * Send report via email (placeholder - requires email service configuration)
 * @param {string} report - Report content
 * @param {string} toEmail - Recipient email
 * @param {Object} options - Email options
 * @returns {Promise<Object>} Result
 */
async function sendReportViaEmail(report, toEmail, options = {}) {
  // This is a placeholder. In production, you would integrate with:
  // - Nodemailer (SMTP)
  // - SendGrid
  // - AWS SES
  // - Mailgun
  // etc.
  
  console.log(`📧 Email report requested for: ${toEmail}`);
  console.log('⚠️  Email service not configured - returning mock response');
  
  // Save report to file as backup
  const filepath = saveReportToFile(report, 'txt', options.deviceId || 'device');
  
  return {
    success: false,
    message: 'Email service not configured',
    details: 'To enable email, configure SMTP settings in environment variables',
    fallback: {
      action: 'Report saved to file',
      filepath: filepath,
      instructions: 'You can manually email this file to the doctor'
    },
    configuration_needed: {
      env_variables: [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'FROM_EMAIL'
      ],
      example: {
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 587,
        SMTP_USER: 'your-email@gmail.com',
        SMTP_PASSWORD: 'your-app-password',
        FROM_EMAIL: 'cardio-monitor@yourdomain.com'
      }
    }
  };
}

/**
 * Calculate statistics from vitals array
 * @param {Array} vitals - Array of vital readings
 * @returns {Object} Statistics
 */
function calculateVitalsStats(vitals) {
  const stats = {
    hr_avg: null,
    hr_min: null,
    hr_max: null,
    spo2_avg: null,
    spo2_min: null,
    spo2_max: null,
    sbp_avg: null,
    sbp_min: null,
    sbp_max: null,
    dbp_avg: null,
    dbp_min: null,
    dbp_max: null
  };
  
  const hrValues = vitals.filter(v => v.hr !== null).map(v => v.hr);
  const spo2Values = vitals.filter(v => v.spo2 !== null).map(v => v.spo2);
  const sbpValues = vitals.filter(v => v.sbp !== null).map(v => v.sbp);
  const dbpValues = vitals.filter(v => v.dbp !== null).map(v => v.dbp);
  
  if (hrValues.length > 0) {
    stats.hr_avg = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
    stats.hr_min = Math.min(...hrValues);
    stats.hr_max = Math.max(...hrValues);
  }
  
  if (spo2Values.length > 0) {
    stats.spo2_avg = spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length;
    stats.spo2_min = Math.min(...spo2Values);
    stats.spo2_max = Math.max(...spo2Values);
  }
  
  if (sbpValues.length > 0) {
    stats.sbp_avg = sbpValues.reduce((a, b) => a + b, 0) / sbpValues.length;
    stats.sbp_min = Math.min(...sbpValues);
    stats.sbp_max = Math.max(...sbpValues);
  }
  
  if (dbpValues.length > 0) {
    stats.dbp_avg = dbpValues.reduce((a, b) => a + b, 0) / dbpValues.length;
    stats.dbp_min = Math.min(...dbpValues);
    stats.dbp_max = Math.max(...dbpValues);
  }
  
  return stats;
}

/**
 * Calculate duration in minutes between two timestamps
 */
function calculateDurationMinutes(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end - start;
  return Math.round(durationMs / (1000 * 60));
}

module.exports = {
  generateJsonReport,
  generateTextReport,
  saveReportToFile,
  sendReportViaEmail
};
