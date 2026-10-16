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

// The three demo complaints, judged from their dispatch records in
// lib/taxiOffice/data.js. Only for those emails: a complaint someone types
// in themselves needs the AI, and says so when it is off.
const COMPLAINTS = {
  daniels: {
    category: 'lateness', firm_at_fault: 'yes', for_licensing: false, licensing_note: '',
    summary: 'Her 7.15 car arrived at 7.31, nobody rang to warn her, and she missed the 7.42 train.',
    staff_steps: ['Ring Ruth today and apologise.', 'Remind the controllers to ring the customer as soon as a car is running late.', 'Decide whether to refund the £8.10 fare.'],
    reply: "Dear Ruth,\n\nYou're right to be disappointed, and we're sorry. Your car was booked for 7.15 and reached you at 7.31. The driver was held up by a road closure on the A376 at Exton, and we should have rung you as soon as we knew, so you could make other plans. We didn't, and that's our mistake.\n\nOur office manager will ring you today.\n\nTidewell Cars"
  },
  holt: {
    category: 'fare', firm_at_fault: 'no', for_licensing: false, licensing_note: '',
    summary: 'He was charged £46.20 from Exeter High Street to Exmouth at 11.20pm and thinks the same trip costs about £30.',
    staff_steps: ['No refund due: the fare is within the night rate for that journey.', 'If he comes back, offer to go through the meter record with him.'],
    reply: "Hi Gary,\n\nThanks for checking with us. We've looked up your journey: you were picked up on Exeter High Street at 11.20pm, and the meter showed £46.20. From 10pm to 6am the night rate applies, so the same trip costs more than it does in the day, when it's around £29 to £32.50. That's the difference from your friend's fare.\n\nIf anything else about the journey wasn't right, just reply and tell us.\n\nTidewell Cars"
  },
  carr: {
    category: 'safety', firm_at_fault: 'unclear', for_licensing: true,
    licensing_note: 'A passenger reported the driver of hackney carriage licence 14 (grey Skoda Octavia, WF22 TWC) texting while driving, on the 15:10 job from Exmouth Community Hospital to Littleham.',
    summary: 'She reports the driver texting on his phone while driving her home from hospital.',
    staff_steps: ['Speak to the driver today and get his account.', 'Ring Sophie today to tell her what is happening.', "Licensing to keep the report with the driver's record and check whether the council needs to be told."],
    reply: "Dear Sophie,\n\nThank you for telling us, and we're sorry you had that journey, on the way home from hospital of all days. Using a phone while driving isn't acceptable in any of our cars, and we're taking it seriously.\n\nWe've found your journey and the driver, and our office manager is dealing with it today. They'll ring you today to tell you what happens next.\n\nTidewell Cars"
  }
};

function complaintDraft(emailId) {
  return COMPLAINTS[emailId] ? { ...COMPLAINTS[emailId] } : null;
}

module.exports = { licensingDraft, socialDraft, complaintDraft };
