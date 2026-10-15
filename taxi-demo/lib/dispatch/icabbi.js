'use strict';

// iCabbi driver: the slot for a real iCabbi connection. Not written yet,
// and deliberately so: it refuses every call rather than pretending a
// booking went through. To connect an operator on iCabbi it needs access to
// the iCabbi booking API for this operator's account (credentials and
// account details from iCabbi, with the operator's agreement). Implement
// createBooking, getBooking and cancelBooking against that API, keep the
// return shapes described in lib/dispatch/index.js, and run it against the
// contract in taxi-demo/test/dispatch.test.js.

const { DispatchNotConfigured } = require('./index');

const NEEDS = "It needs access to the iCabbi booking API for this operator\"s account (credentials and account details from iCabbi, with the operator\"s agreement).";

function create() {
  const refuse = async () => { throw new DispatchNotConfigured('iCabbi', NEEDS); };
  return {
    name: 'icabbi',
    label: 'iCabbi',
    configured: () => false,
    createBooking: refuse,
    getBooking: refuse,
    cancelBooking: refuse
  };
}

module.exports = { create };
