'use strict';

// The made-up inbox the office runs on until a real mailbox is connected
// (proposal of 9 November 2026: made-up data only until Dan's approval and
// the data processing agreement). Every person, address, journey and
// reference here is invented; the addresses end in example.invalid so a
// demo row can always be told from a real one. Dates move with today so the
// office never looks stale, and two emails are old enough to show what an
// unanswered one looks like once it passes the escalation time.
//
// Each email carries a prepared reading, which is what the office shows
// when the AI is off, labelled as prepared, never as the AI's work.

const { firm } = require('./firm');

function todayLondon(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function longDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
const at = (ymd, hm) => `${ymd}T${hm}`;

function seedInbox(today = todayLondon()) {
  const f = firm();
  const sig = f.signature;
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const twoDaysAgo = addDays(today, -2);
  const threeDaysAgo = addDays(today, -3);
  const journey = (date, time, pickup, destination, passengers) => ({ date, time, pickup, destination, passengers });
  const none = journey('', '', '', '', '');
  return [
    {
      id: 'demo-pascoe', messageId: '<demo-pascoe@example.invalid>', from: 'Jenna Pascoe <jenna.pascoe@example.invalid>', subject: 'Taxi to the station tomorrow morning',
      receivedAt: at(today, '08:12'),
      body: `Hi,\n\nCould I book a taxi for tomorrow morning please? Pickup from 14 Trelawney Road at 6.40am, going to Truro station for the 7.30 train. Just me and one suitcase.\n\nMy mobile is 07700 900123.\n\nThanks,\nJenna`,
      prepared: { intent: 'new_booking', customer_name: 'Jenna Pascoe', phone: '07700 900123', reference: '', journey: journey(tomorrow, '06:40', '14 Trelawney Road', 'Truro station', '1'), missing: [], seriousness: 'none', summary: 'A taxi for one person at 6.40am tomorrow from Trelawney Road to Truro station.', reply: `Hi Jenna,\n\nThat's booked for you: 6.40am tomorrow from 14 Trelawney Road to Truro station, one passenger and a suitcase. The driver will have your mobile if they need it.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-hocking', messageId: '<demo-hocking@example.invalid>', from: 'Mark Hocking <m.hocking@example.invalid>', subject: 'Airport run Saturday',
      receivedAt: at(today, '07:45'),
      body: `Morning\n\nWe need a car to Newquay airport on Saturday for a 10.15 flight, 4 of us with luggage. Pick up from the Greenbank area. What time would you suggest and can you confirm?\n\nMark`,
      prepared: { intent: 'new_booking', customer_name: 'Mark Hocking', phone: '', reference: '', journey: journey(addDays(today, ((6 - new Date(`${today}T12:00:00Z`).getUTCDay()) + 7) % 7 || 7), '', 'Greenbank area', 'Newquay airport', '4'), missing: ['pickup address', 'pickup time', 'phone number'], seriousness: 'none', summary: 'Four people to Newquay airport on Saturday for a 10.15 flight, from the Greenbank area, time and address not yet given.', reply: `Hi Mark,\n\nHappy to sort that for Saturday. Before I can book it I need the full pickup address and a mobile number for the driver, and if you let me know how early you want to be at the airport I'll confirm a pickup time to suit.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-rowe', messageId: '<demo-rowe@example.invalid>', from: 'Claire Rowe <claire.rowe@example.invalid>', subject: 'Change to booking on Friday',
      receivedAt: at(yesterday, '17:20'),
      body: `Hello,\n\nI have a booking on Friday at 7pm from The Moor to Penryn, under Rowe. Could we make it 7.30pm instead please? Same pickup.\n\nThank you,\nClaire Rowe`,
      prepared: { intent: 'change', customer_name: 'Claire Rowe', phone: '', reference: '', journey: journey('', '19:30', 'The Moor', 'Penryn', ''), missing: [], seriousness: 'none', summary: 'Move the Friday 7pm booking from The Moor to Penryn to 7.30pm.', reply: `Hi Claire,\n\nNo problem, I've moved your Friday booking to 7.30pm, same pickup at The Moor going to Penryn.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-trevithick', messageId: '<demo-trevithick@example.invalid>', from: 'Sam Trevithick <sam.t@example.invalid>', subject: 'Cancel tonight',
      receivedAt: at(today, '09:02'),
      body: `Hi, please cancel the taxi booked for tonight at 11.15pm from the Chain Locker, name Trevithick. Plans changed. Cheers, Sam`,
      prepared: { intent: 'cancel', customer_name: 'Sam Trevithick', phone: '', reference: '', journey: journey(today, '23:15', 'Chain Locker', '', ''), missing: [], seriousness: 'none', summary: "Cancel tonight's 11.15pm booking from the Chain Locker.", reply: `Hi Sam,\n\nThat's cancelled, no problem. Give us a shout when you next need a car.\n\nCheers,\n${sig}` }
    },
    {
      id: 'demo-umbrella', messageId: '<demo-umbrella@example.invalid>', from: 'Priya Nair <priya.nair@example.invalid>', subject: 'Left my glasses in the taxi',
      receivedAt: at(yesterday, '21:40'),
      body: `Hi there, I think I left my reading glasses (black case) in one of your cars last night, about 10pm from Events Square to Mawnan Smith. Has anyone handed them in? Priya, 07700 900456`,
      prepared: { intent: 'lost_property', customer_name: 'Priya Nair', phone: '07700 900456', reference: '', journey: journey(twoDaysAgo, '22:00', 'Events Square', 'Mawnan Smith', ''), missing: [], seriousness: 'none', summary: 'Reading glasses in a black case left in a car at about 10pm from Events Square to Mawnan Smith.', reply: `Hi Priya,\n\nSorry to hear that. I'll check with the driver who did Events Square to Mawnan Smith at about 10pm and have a look in the office, and I'll ring you on 07700 900456 as soon as I know either way.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-account', messageId: '<demo-account@example.invalid>', from: 'Accounts, Harbourside Dental <accounts@harbourside-dental.example.invalid>', subject: 'Setting up an account for staff journeys',
      receivedAt: at(twoDaysAgo, '10:30'),
      body: `Good morning,\n\nWe're a dental practice in town and would like to set up a business account for occasional staff and patient journeys, invoiced monthly. Could you let me know what you need from us?\n\nKind regards,\nLouise Penrose\nPractice Manager`,
      prepared: { intent: 'account', customer_name: 'Louise Penrose', phone: '', reference: '', journey: none, missing: [], seriousness: 'none', summary: 'A dental practice wants to open a monthly invoiced business account.', reply: `Dear Louise,\n\nThanks for thinking of us. We can set up an account for the practice, and I'll get the details of how it works and what we need from you over to you today.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-late', messageId: '<demo-late@example.invalid>', from: 'Dave Carne <dave.carne@example.invalid>', subject: 'Twenty minutes late and no call',
      receivedAt: at(yesterday, '08:55'),
      body: `I booked a car for 6.30 yesterday morning to get to Truro for a hospital appointment and it turned up at ten to seven. Nobody rang to say it was running late. I made the appointment by the skin of my teeth. Not good enough.\n\nDave Carne`,
      prepared: { intent: 'complaint', customer_name: 'Dave Carne', phone: '', reference: '', journey: journey(twoDaysAgo, '06:30', '', 'Truro', ''), missing: [], seriousness: 'serious', summary: 'The 6.30am car to Truro arrived twenty minutes late with no call, for a hospital appointment.', reply: '' },
      preparedComplaint: { seriousness: 'serious', summary: 'A 6.30am car for a hospital appointment arrived twenty minutes late and nobody rang.', firm_at_fault: 'unclear', for_licensing: false, staff_steps: ['Find the job in dispatch and check the booked and arrival times.', 'Speak to the driver about why nobody rang.', 'Ring Dave to apologise and decide whether anything is owed.'], reply: `Hi Dave,\n\nI'm sorry about yesterday morning. A car for a hospital appointment should be there when it's booked for, and if it's running late you should get a call. I'm checking exactly what happened with that job this morning and I'll ring you once I have.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-fare', messageId: '<demo-fare@example.invalid>', from: 'Megan Oates <megan.oates@example.invalid>', subject: 'Charged more than usual',
      receivedAt: at(today, '08:40'),
      body: `Hi, I do the same trip home from work most Fridays, Penryn to Swanpool, and it's normally about £9. Last Friday night the driver charged me £13.50. Was that a mistake?\n\nMegan`,
      prepared: { intent: 'complaint', customer_name: 'Megan Oates', phone: '', reference: '', journey: journey('', '', 'Penryn', 'Swanpool', ''), missing: [], seriousness: 'minor', summary: 'A Friday night Penryn to Swanpool fare of £13.50 against a usual £9.', reply: '' },
      preparedComplaint: { seriousness: 'minor', summary: 'A regular Friday night fare came to £13.50 against the usual £9.', firm_at_fault: 'unclear', for_licensing: false, staff_steps: ['Find the job in dispatch and check the fare, the time and the tariff that applied.', 'If it was wrong, decide whether to refund the difference.', 'Reply to Megan with what the record shows.'], reply: `Hi Megan,\n\nThanks for asking rather than leaving it. I'm looking up that Friday journey now to see what the meter recorded and which rate applied, and I'll come back to you today with what I find.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-phone', messageId: '<demo-phone@example.invalid>', from: 'Rob Ellery <rob.ellery@example.invalid>', subject: 'Driver on his phone the whole way',
      receivedAt: at(threeDaysAgo, '19:10'),
      body: `I want to report that the driver who took us from Gyllyngvase to Budock Water this afternoon was texting while driving, holding the phone in his hand on the main road. I asked him to stop and he laughed. I have the time, about 3.15pm. This needs dealing with.\n\nRob Ellery\n07700 900789`,
      prepared: { intent: 'complaint', customer_name: 'Rob Ellery', phone: '07700 900789', reference: '', journey: journey(threeDaysAgo, '15:15', 'Gyllyngvase', 'Budock Water', ''), missing: [], seriousness: 'safety', summary: 'A driver texting at the wheel from Gyllyngvase to Budock Water at about 3.15pm.', reply: '' },
      preparedComplaint: { seriousness: 'safety', summary: 'A driver was texting at the wheel on the main road, and laughed when asked to stop.', firm_at_fault: 'unclear', for_licensing: true, staff_steps: ['Find the job in dispatch and identify the driver and car.', 'Speak to the driver today; a manager decides what happens next.', 'Ring Rob to say it is being dealt with.', 'Consider what must be reported to licensing.'], reply: `Hi Rob,\n\nThank you for reporting this, and I'm sorry you had that journey. A driver using a phone at the wheel is something we take seriously. We're finding out exactly what happened this afternoon and a manager will ring you on 07700 900789 to talk it through.\n\nThanks,\n${sig}` }
    },
    {
      id: 'demo-council', messageId: '<demo-council@example.invalid>', from: 'Licensing Team <licensing@council.example.invalid>', subject: 'Vehicle licence renewal: documents required',
      receivedAt: at(yesterday, '11:05'),
      body: `Dear Operator,\n\nFor the vehicle licence renewal due at the end of the month, please send a current insurance certificate and the latest compliance test certificate within 7 days.\n\nLicensing Team`,
      prepared: { intent: 'council', customer_name: '', phone: '', reference: '', journey: none, missing: [], seriousness: 'none', summary: 'The licensing team wants an insurance certificate and a compliance test certificate within 7 days for a vehicle renewal.', reply: '' },
      preparedCouncil: { summary: 'The licensing team wants an insurance certificate and a compliance test certificate within 7 days for a vehicle renewal.', asks: ['A current insurance certificate', 'The latest compliance test certificate'], deadline: addDays(yesterday, 7), reference: '', about: 'A vehicle licence due for renewal at the end of the month', staff_steps: ['Find which vehicle the renewal is for.', 'Get the current insurance certificate and the latest compliance test certificate.', 'Send both to the licensing team before the deadline.'], reply: `Dear Licensing Team,\n\nThank you for your email about the vehicle licence renewal due at the end of the month. We will send a current insurance certificate and the latest compliance test certificate by ${new Date(`${addDays(yesterday, 7)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}, within the seven days you asked for.\n\nKind regards,\n${sig}` }
    },
    {
      id: 'demo-spam', messageId: '<demo-spam@example.invalid>', from: 'Growth Partners <hello@growthpartners.example.invalid>', subject: 'Triple your bookings with our marketing system',
      receivedAt: at(today, '06:00'),
      body: `Hi, we help taxi firms like yours grow with our proven marketing system. Book a free strategy call this week! Reply STOP to unsubscribe.`,
      prepared: { intent: 'other', customer_name: '', phone: '', reference: '', journey: none, missing: [], seriousness: 'none', summary: 'A marketing company selling its services; not a customer.', reply: '' }
    }
  ].map((e) => ({ ...e, to: [`office@${f.short.toLowerCase()}.example.invalid`], threadId: e.messageId }));
}

module.exports = { seedInbox, todayLondon, addDays, longDate };
