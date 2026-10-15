'use strict';

// Confirmation texts and emails, as a stub. A live build sends these through
// the operator's SMS provider (most dispatch systems send their own) and its
// mail service. The demo writes what would be sent to the log, with the
// number and address masked, and sends nothing.

const { FIRM } = require('./firm');
const { maskPhone, maskEmail, firstName, isMobile } = require('./booking');
const { describe } = require('./fares');

const lines = [];
function log(line) {
  lines.push(line);
  if (lines.length > 200) lines.shift();
  if (process.env.NODE_ENV !== 'test') console.log(line);
}

function whenText(b) {
  if (b.when === 'now') return 'as soon as possible';
  return new Date(b.pickupAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function bookingReceived(b, ref) {
  const text = `${FIRM.name}: booking ${ref} received, ${whenText(b)} from ${b.pickup}. ${b.when === 'now' ? 'We\'ll text your driver\'s details shortly.' : 'We\'ll text your driver\'s details before pickup.'} ${FIRM.phone}`;
  if (isMobile(b.phone)) log(`[notify stub] SMS to ${maskPhone(b.phone)}: ${text}`);
  if (b.email) log(`[notify stub] Email to ${maskEmail(b.email)}: "Your booking ${ref}" (${describe(b.quote)}, ${b.payment})`);
  return { sms: isMobile(b.phone), email: Boolean(b.email) };
}

function driverAllocated(record, view) {
  if (!record || !isMobile(record.phone)) return;
  log(`[notify stub] SMS to ${maskPhone(record.phone)}: ${FIRM.name}: ${firstName(record.name)}, ${view.driver.name} is on the way in a ${view.driver.car} (${view.driver.reg}), about ${view.etaMinutes} minutes. Ref ${view.ref}.`);
}

function enquiry(kind, fields) {
  log(`[notify stub] New ${kind} enquiry for the office: ${Object.keys(fields).filter((k) => fields[k]).join(', ')} supplied`);
}

module.exports = { bookingReceived, driverAllocated, enquiry, recent: () => lines.slice() };
