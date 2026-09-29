class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const durationMinutes = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

module.exports = { HttpError, isIso, isDate, durationMinutes };
