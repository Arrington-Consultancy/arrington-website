'use strict';

// What the office shows when the AI is switched off or cannot be reached:
// drafts written by hand for this demo. Every page that shows one says so
// in words ("Prepared for the demo, the AI is off"), so a prepared draft is
// never passed off as the AI's own work.

const { FIRM } = require('../../taxi-demo/lib/firm');
const { longDate } = require('./data');

function licensingDraft(item, councilEmail) {
  if (councilEmail) {
    return {
      to: 'Licensing Team',
      subject: `${item.subject.split(',')[0]}: current insurance certificate`,
      body: `Dear Licensing Team,\n\nThank you for your email. The insurance for ${item.subject.split(',')[0].toLowerCase()} was renewed before the old certificate expired, and I attach a copy of the current certificate.\n\nPlease let me know if you need anything else.\n\nKind regards,\nOffice Manager, Tidewell Cars`,
      checklist: ['Attach the current insurance certificate for this vehicle.', 'Check the policy dates and vehicle details on the certificate match the licence.', 'Reply within the 7 days the council asked for.']
    };
  }
  return {
    to: 'Licensing Team',
    subject: `${item.subject.split(',')[0]}: ${item.item.toLowerCase()}`,
    body: `Dear Licensing Team,\n\n${item.subject} has its ${item.item.toLowerCase()} due on ${longDate(item.due)}. Please could you let us know how you would like us to arrange it, and what you need from us.\n\nKind regards,\nOffice Manager, Tidewell Cars`,
    checklist: ["Check the council's own guidance for this renewal before sending.", 'Confirm the due date against the licence itself.', 'Gather any certificates the council will ask for.']
  };
}

function socialDraft() {
  return [
    { platform: 'Facebook', image: 'fleet-dawn', why: 'A new car is news, and it answers the groups who ring for a bigger vehicle.', text: `There's a new 8-seater in the ${FIRM.name} fleet this week. It's ideal for groups and airport runs with plenty of luggage. Book online, or ring us on ${FIRM.phone}.` },
    { platform: 'Instagram', image: 'driver', why: 'People book drivers they feel they know.', text: 'Fifteen years with us this month: thank you, Steve. Plenty of Exmouth regulars ask for him by name. #Exmouth #TidewellCars' },
    { platform: 'Google Business Profile', image: 'airport-night', why: 'A clear fixed price is what airport searchers want to see.', text: 'Flying from Exeter? It\'s a fixed £28 to Exeter Airport from anywhere in our local area, day or night. Book ahead online or by phone.' }
  ];
}

module.exports = { licensingDraft, socialDraft };
