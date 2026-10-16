'use strict';

// Tidewell Cars office (Tom, 16/10/2026: "I want a staff portal taxi related
// I can show Dan"). The made-up records the office works on: the dispatch
// board, the booking inbox, the licensing register and the facts the social
// worker writes from.
//
// Same ground rules as the public demo (taxi-demo/lib/firm.js): the firm is
// invented, phone numbers are Ofcom's drama range (07700 900xxx), email
// addresses are on example.com, street names are made up, and no real
// council, company or person is named. The council is "the council's
// licensing team" and nothing more.
//
// Every date is worked out from today in London, so the demo never goes
// stale: "tomorrow" in an email is always tomorrow, and the board, the inbox
// and the register always agree with each other.

const { londonParts } = require('../../taxi-demo/lib/fares');
const { FIRM } = require('../../taxi-demo/lib/firm');

const DAY_MS = 24 * 60 * 60 * 1000;

function todayLondon(now = new Date()) {
  return londonParts(now).date;
}

// Days from today to the coming Saturday (0 on a Saturday): the stag party
// and the late night out are Saturday jobs whatever day the demo is opened,
// and an email that says "Saturday" on a Saturday means tonight.
function toSaturday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (6 - dow + 7) % 7;
}

// 'YYYY-MM-DD' plus n days, as a calendar date (no clock involved).
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function weekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// "Saturday 18 October"
function longDate(ymd) {
  const [, m, d] = ymd.split('-').map(Number);
  return `${weekday(ymd)} ${d} ${MONTHS[m - 1]}`;
}

function shortDate(ymd) {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

// The dispatch board, as the booking software holds it this morning. Some
// of these are right, one was keyed with the wrong time, one is missing its
// return and one is waiting to be cancelled: the booking inbox finds which.
function seedBoard(today) {
  const D = (n) => addDays(today, n);
  const SAT = toSaturday(today);
  return [
    { ref: 'TW-41170', date: D(0), time: '07:40', name: 'Hannah Pike', phone: '07700 900104', pickup: 'Kittiwake Lane, Littleham', destination: 'Exmouth railway station', passengers: 1, vehicle: 'saloon', source: 'Phone', notes: '' },
    { ref: 'TW-41172', date: D(0), time: '08:15', name: 'Estuary Joinery (account)', phone: '07700 900348', pickup: 'Harbour Lane, Lympstone', destination: 'Exeter St Davids station', passengers: 1, vehicle: 'saloon', source: 'Account', notes: 'Account: Estuary Joinery' },
    { ref: 'TW-41175', date: D(0), time: '09:30', name: 'Graham Ellis', phone: '07700 900136', pickup: 'Exmouth Community Hospital', destination: 'Saltmarsh Way, Withycombe Raleigh', passengers: 1, vehicle: 'wav', source: 'Phone', notes: 'Wheelchair, needs the ramp' },
    { ref: 'TW-41178', date: D(0), time: '11:00', name: 'Carol Webb', phone: '07700 900157', pickup: 'The Strand, Exmouth town centre', destination: 'Topsham, Fore Street', passengers: 2, vehicle: 'saloon', source: 'Website', notes: '' },
    { ref: 'TW-41181', date: D(0), time: '14:20', name: 'Liam Hart', phone: '07700 900178', pickup: 'Exmouth Marina', destination: 'Exeter Airport', passengers: 3, vehicle: 'estate', source: 'Website', notes: 'Three suitcases' },
    { ref: 'TW-41184', date: D(0), time: '17:45', name: 'Nadia Brooks', phone: '07700 900189', pickup: 'University of Exeter, Streatham campus', destination: 'Brixington', passengers: 1, vehicle: 'saloon', source: 'Phone', notes: '' },
    { ref: 'TW-41186', date: D(1), time: '09:15', name: 'Margaret Hollis', phone: '07700 900211', pickup: '9 Pebblebed Close, Exmouth', destination: 'Royal Devon and Exeter Hospital, Wonford', passengers: 1, vehicle: 'saloon', source: 'Email', notes: 'Walking frame, help her to the car' },
    { ref: 'TW-41191', date: D(1), time: '07:00', name: 'Brian Fowler', phone: '07700 900917', pickup: '22 Shingle Rise, Brixington', destination: 'Exmouth railway station', passengers: 1, vehicle: 'saloon', source: 'Phone', notes: '' },
    { ref: 'TW-41194', date: D(1), time: '12:30', name: 'Owen Reid', phone: '07700 900253', pickup: 'Budleigh Salterton, Fore Street', destination: 'Exmouth Community Hospital', passengers: 2, vehicle: 'saloon', source: 'Phone', notes: '' },
    // Keyed at 05:50 from Paul's email; he asked for 05:30.
    { ref: 'TW-41203', date: D(2), time: '05:50', name: 'Paul Gregory', phone: '07700 900348', pickup: 'Estuary Joinery, Harbour Lane, Lympstone', destination: 'Exeter Airport', passengers: 2, vehicle: 'saloon', source: 'Email', notes: 'Account: Estuary Joinery. Two cases' },
    { ref: 'TW-41207', date: D(2), time: '13:00', name: 'Dev Patel', phone: '07700 900734', pickup: 'Exmouth railway station', destination: 'Exeter St Davids station', passengers: 1, vehicle: 'saloon', source: 'Website', notes: '' },
    // The outward journey went in; the 01:00 return did not.
    { ref: 'TW-41212', date: D(SAT), time: '19:00', name: 'Jamie Clarke', phone: '07700 900829', pickup: 'Exmouth Marina', destination: 'Exeter city centre, High Street', passengers: 8, vehicle: 'mpv8', source: 'Email', notes: 'Stag party' },
    { ref: 'TW-41215', date: D(3), time: '10:10', name: 'Rosa Lindqvist', phone: '07700 900271', pickup: 'Woodbury village', destination: 'Exeter Airport', passengers: 2, vehicle: 'saloon', source: 'Website', notes: '' }
  ].map((j) => ({ ...j, status: 'booked' }));
}

// The booking inbox. Each email is written from the dates above, so the
// words in it ("tomorrow", "Saturday") always point at the right day.
//
// `prepared` is the answer this demo expects, written by hand. It is what
// the tests check the matcher against, and what the office shows, plainly
// labelled, only when the AI is switched off or cannot be reached. It is
// never presented as the AI's reading.
function seedInbox(today) {
  const D = (n) => addDays(today, n);
  const SAT = toSaturday(today);
  const at = (n, hhmm) => `${D(n)}T${hhmm}`;
  return [
    {
      id: 'hollis',
      from: 'Margaret Hollis <m.hollis@example.com>',
      // Received this morning, so "tomorrow" in her email and the date she
      // writes beside it agree. (Received yesterday, they contradicted each
      // other and the live model rightly left the date blank, 16/10/2026.)
      receivedAt: at(0, '07:12'),
      subject: 'Taxi for my hospital appointment',
      body: `Hello,\n\nCould I book a taxi for tomorrow, ${longDate(D(1))}, please. I need to go from my home at 9 Pebblebed Close, Exmouth to the Royal Devon and Exeter Hospital at Wonford. My appointment is at 10am so a 9.15 pick up would be lovely.\n\nIt's just me, but I use a walking frame so I'd be grateful for a hand with it.\n\nMy number is 07700 900211.\n\nThank you,\nMargaret Hollis`,
      prepared: {
        intent: 'new_booking', customer_name: 'Margaret Hollis', phone: '07700 900211', reference: '',
        journeys: [{ date: D(1), time: '09:15', pickup: '9 Pebblebed Close, Exmouth', destination: 'Royal Devon and Exeter Hospital, Wonford', passengers: 1, vehicle: 'saloon', needs: 'Walking frame, help to the car' }],
        missing: [],
        summary: 'A new booking for tomorrow morning to the hospital, with help for a walking frame.',
        reply: `Dear Margaret,\n\nThank you, you're booked. A car will collect you from 9 Pebblebed Close at 9.15am on ${longDate(D(1))} and take you to the Royal Devon and Exeter Hospital at Wonford. Your driver will help you with your walking frame.\n\nIf anything changes, just reply to this email or ring us on ${FIRM.phone}.\n\nKind regards,\nTidewell Cars`
      }
    },
    {
      id: 'gregory',
      from: 'Paul Gregory <paul@estuaryjoinery.example.com>',
      receivedAt: at(0, '06:58'),
      subject: 'Airport run, account',
      body: `Morning,\n\nPlease can you book two of us from the yard (Estuary Joinery, Harbour Lane, Lympstone) to Exeter Airport on ${weekday(D(2))}. Pick up 5.30am please, we're on the 7.10 flight. Two cases.\n\nOn the account as usual.\n\nCheers,\nPaul Gregory\n07700 900348`,
      prepared: {
        intent: 'new_booking', customer_name: 'Paul Gregory', phone: '07700 900348', reference: '',
        journeys: [{ date: D(2), time: '05:30', pickup: 'Estuary Joinery, Harbour Lane, Lympstone', destination: 'Exeter Airport', passengers: 2, vehicle: 'saloon', needs: 'Two cases. Account: Estuary Joinery' }],
        missing: [],
        summary: 'Two people to Exeter Airport on the Estuary Joinery account, collected at 5.30am.',
        reply: `Morning Paul,\n\nAll booked: two of you from the yard at Harbour Lane, Lympstone to Exeter Airport on ${longDate(D(2))}, collected at 5.30am, with room for two cases. It's going on the Estuary Joinery account.\n\nHave a good trip.\n\nTidewell Cars`
      }
    },
    {
      id: 'turner',
      from: 'Sophie Turner <sophiet@example.com>',
      receivedAt: at(0, '08:14'),
      subject: 'Taxi Saturday night?',
      body: `Hi!\n\nCan we get a taxi for 4 of us on Saturday night please, from The Strand in Exmouth to Budleigh Salterton at 11.30pm.\n\nThanks\nSophie\n07700 900562`,
      prepared: {
        intent: 'new_booking', customer_name: 'Sophie Turner', phone: '07700 900562', reference: '',
        journeys: [{ date: D(SAT), time: '23:30', pickup: 'The Strand, Exmouth town centre', destination: 'Budleigh Salterton', passengers: 4, vehicle: 'saloon', needs: '' }],
        missing: [],
        summary: 'Four people from The Strand to Budleigh Salterton late on Saturday night.',
        reply: `Hi Sophie,\n\nThat's booked: a car for four of you from The Strand, Exmouth to Budleigh Salterton at 11.30pm on ${longDate(D(SAT))}. The night rate applies after 10pm.\n\nEnjoy your night.\n\nTidewell Cars`
      }
    },
    {
      id: 'patel',
      from: 'Dev Patel <dev.patel@example.com>',
      receivedAt: at(0, '08:40'),
      subject: 'Change of time, booking TW-41207',
      body: `Hello,\n\nI've got a taxi booked for ${weekday(D(2))} (ref TW-41207) at 1pm from Exmouth station to Exeter St Davids. My train has been moved, could you make it 2pm instead?\n\nThanks,\nDev Patel\n07700 900734`,
      prepared: {
        intent: 'change', customer_name: 'Dev Patel', phone: '07700 900734', reference: 'TW-41207',
        journeys: [{ date: D(2), time: '14:00', pickup: 'Exmouth railway station', destination: 'Exeter St Davids station', passengers: 1, vehicle: 'saloon', needs: '' }],
        missing: [],
        summary: 'Move booking TW-41207 from 1pm to 2pm.',
        reply: `Hello Dev,\n\nNo problem, we've moved booking TW-41207 to 2pm on ${longDate(D(2))}, from Exmouth station to Exeter St Davids. Everything else stays the same.\n\nTidewell Cars`
      }
    },
    {
      id: 'rowe',
      from: 'Ellen Rowe <ellen.rowe@example.com>',
      receivedAt: at(0, '09:02'),
      subject: 'Wheelchair taxi to St Davids',
      body: `Good morning,\n\nI'd like to book a wheelchair accessible taxi on ${weekday(D(4))} to get to Exeter St Davids for the 10.40 train to London. I use a powered wheelchair.\n\nCould you let me know the price please?\n\nMany thanks,\nEllen Rowe`,
      prepared: {
        intent: 'new_booking', customer_name: 'Ellen Rowe', phone: '', reference: '',
        journeys: [{ date: D(4), time: '', pickup: '', destination: 'Exeter St Davids station', passengers: 1, vehicle: 'wav', needs: 'Powered wheelchair. Train at 10:40' }],
        missing: ['pickup address', 'pickup time', 'phone number'],
        summary: 'A wheelchair accessible car to Exeter St Davids for a 10.40 train, but no pickup address or phone number.',
        reply: `Good morning Ellen,\n\nThank you, we'd be glad to take you. A wheelchair accessible car to Exeter St Davids costs the same as a standard car, £30 from Exmouth.\n\nSo we can book it, could you send us the address we're collecting you from and a phone number for the driver? For a 10.40 train we'd suggest a pick up at about 9.40, but tell us what suits you.\n\nKind regards,\nTidewell Cars`
      }
    },
    {
      id: 'clarke',
      from: 'Jamie Clarke <jamie.c@example.com>',
      receivedAt: at(-1, '21:15'),
      subject: 'Stag do minibus',
      body: `Hi,\n\nBooking for 8 of us on Saturday: pick up 7pm from Exmouth Marina into Exeter (High Street), then back to the Marina at 1am.\n\nJamie\n07700 900829`,
      prepared: {
        intent: 'new_booking', customer_name: 'Jamie Clarke', phone: '07700 900829', reference: '',
        journeys: [
          { date: D(SAT), time: '19:00', pickup: 'Exmouth Marina', destination: 'Exeter city centre, High Street', passengers: 8, vehicle: 'mpv8', needs: '' },
          { date: D(SAT + 1), time: '01:00', pickup: 'Exeter city centre, High Street', destination: 'Exmouth Marina', passengers: 8, vehicle: 'mpv8', needs: '' }
        ],
        missing: [],
        summary: 'An 8-seater into Exeter at 7pm and back to the Marina at 1am.',
        reply: `Hi Jamie,\n\nYou're booked: an 8-seater from Exmouth Marina to Exeter High Street at 7pm on ${longDate(D(SAT))}, and back to the Marina at 1am. The night rate applies to the return.\n\nHave a good one.\n\nTidewell Cars`
      }
    },
    {
      id: 'fowler',
      from: 'Brian Fowler <b.fowler@example.com>',
      receivedAt: at(0, '06:05'),
      subject: 'Cancel tomorrow',
      body: `Please cancel my taxi tomorrow at 7am to Exmouth station, I'm not well.\n\nBrian Fowler\n07700 900917`,
      prepared: {
        intent: 'cancel', customer_name: 'Brian Fowler', phone: '07700 900917', reference: '',
        journeys: [{ date: D(1), time: '07:00', pickup: '', destination: 'Exmouth railway station', passengers: 1, vehicle: 'saloon', needs: '' }],
        missing: [],
        summary: 'Cancel tomorrow\'s 7am car to Exmouth station.',
        reply: `Dear Brian,\n\nThat's cancelled: your 7am taxi to Exmouth station on ${longDate(D(1))}. There's no charge. We hope you feel better soon.\n\nTidewell Cars`
      }
    },
    {
      id: 'umbrella',
      from: 'Kate Moreton <katem@example.com>',
      receivedAt: at(0, '07:31'),
      subject: 'Left my umbrella',
      body: `Hi, I think I left a navy umbrella in one of your taxis last night, Exeter to Exmouth about 11pm. Has anyone handed it in?\n\nKate`,
      prepared: {
        intent: 'not_booking', customer_name: 'Kate Moreton', phone: '', reference: '',
        journeys: [],
        missing: [],
        summary: 'Lost property: a navy umbrella left in a car from Exeter to Exmouth last night.',
        reply: `Hi Kate,\n\nSorry to hear that. We'll check with last night's drivers and the lost property shelf this morning, and let you know either way by the end of the day.\n\nTidewell Cars`
      }
    },
    {
      id: 'council-14',
      from: 'Licensing Team <licensing@council.example.gov.uk>',
      receivedAt: at(-1, '15:30'),
      subject: 'Hackney carriage licence 14: insurance certificate',
      body: `Dear Tidewell Cars,\n\nOur records show that the insurance certificate we hold for hackney carriage vehicle licence 14 expired on ${longDate(D(-3))}. Please send us a copy of the current certificate within 7 days.\n\nRegards,\nLicensing Team`,
      routeTo: 'licensing',
      prepared: {
        intent: 'council', customer_name: 'Licensing Team', phone: '', reference: '',
        journeys: [],
        missing: [],
        summary: 'The council wants the current insurance certificate for vehicle licence 14. It goes to Licensing.',
        reply: ''
      }
    }
  ];
}

// The licensing register: driver badges and vehicle licences, with the
// dates the council needs things by. Made up, as above.
function seedRegister(today) {
  const D = (n) => addDays(today, n);
  return [
    { id: 'veh-14', kind: 'vehicle', subject: 'Hackney carriage licence 14, Skoda Octavia', item: 'Insurance certificate', due: D(-3), note: `Renewed on ${shortDate(D(-4))}. The council still holds the old certificate and has asked for the new one.`, council: 'council-14' },
    { id: 'veh-21', kind: 'vehicle', subject: 'Hackney carriage licence 21, Ford Tourneo (wheelchair accessible)', item: 'Compliance test', due: D(6), note: 'Test not yet booked.' },
    { id: 'drv-lakeman', kind: 'driver', subject: 'Steve Lakeman, driver', item: 'Driver badge renewal', due: D(9), note: 'Medical done. DBS certificate in date.' },
    { id: 'ph-07', kind: 'vehicle', subject: 'Private hire licence 07, Toyota Corolla', item: 'Vehicle licence renewal', due: D(18), note: '' },
    { id: 'drv-cole', kind: 'driver', subject: 'Dean Cole, driver', item: 'Medical certificate', due: D(24), note: 'GP appointment needed.' },
    { id: 'veh-03', kind: 'vehicle', subject: 'Hackney carriage licence 03, Mercedes Vito 8-seater', item: 'MOT', due: D(45), note: '' },
    { id: 'drv-shah', kind: 'driver', subject: 'Priya Shah, driver', item: 'Driver badge renewal', due: D(120), note: '' },
    { id: 'ph-11', kind: 'vehicle', subject: 'Private hire licence 11, Skoda Superb', item: 'Insurance certificate', due: D(160), note: '' }
  ];
}

function daysUntil(today, ymd) {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = ymd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

// Overdue, due within two weeks, within a month, or fine.
function urgency(today, ymd) {
  const n = daysUntil(today, ymd);
  if (n < 0) return { level: 'overdue', days: n, label: `Overdue by ${-n} day${n === -1 ? '' : 's'}` };
  if (n === 0) return { level: 'urgent', days: 0, label: 'Due today' };
  if (n <= 14) return { level: 'urgent', days: n, label: `Due in ${n} day${n === 1 ? '' : 's'}` };
  if (n <= 30) return { level: 'soon', days: n, label: `Due in ${n} days` };
  return { level: 'ok', days: n, label: `${shortDate(ymd)}` };
}

// What the social worker writes from: true of the made-up firm, nothing
// invented about any real place, event or person.
function socialFacts(today) {
  return [
    `${FIRM.name} runs ${FIRM.fleet} cars from one control room in ${FIRM.town}: ${FIRM.taxis} hackney carriage taxis with roof lights and ${FIRM.privateHire} private hire cars.`,
    `${FIRM.wheelchairCars} of the cars are wheelchair accessible, and they cost the same as a standard car.`,
    'Exeter Airport is a fixed £28 from anywhere in the local area, day or night.',
    'Steve Lakeman, one of the drivers, has been with the firm 15 years this month.',
    'A new 8-seater joined the fleet this week, for groups and airport runs with luggage.',
    'Saturday nights get busy after 11pm; booking ahead is the surest way to get a car home.',
    `Bookings can be made online, by phone on ${FIRM.phone}, or by email.`
  ];
}

const SOCIAL_IMAGES = [
  { id: 'fleet-dawn', label: 'The fleet at dawn' },
  { id: 'airport-night', label: 'Airport drop-off at night' },
  { id: 'driver', label: 'A driver' },
  { id: 'wav', label: 'Wheelchair accessible car' },
  { id: 'huts-evening', label: 'Beach huts in the evening' },
  { id: 'estuary-sand', label: 'The estuary' },
  { id: 'hero-exmouth', label: 'A taxi in Exmouth' }
];

module.exports = {
  todayLondon, addDays, toSaturday, weekday, longDate, shortDate, daysUntil, urgency,
  seedBoard, seedInbox, seedRegister, socialFacts, SOCIAL_IMAGES
};
