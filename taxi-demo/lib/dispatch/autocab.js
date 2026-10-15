'use strict';

// Autocab driver: the slot for a real Autocab connection. Not written yet,
// and deliberately so: it refuses every call rather than pretending a
// booking went through. To connect an operator on Autocab it needs access
// to Autocab's booking API for this operator (credentials issued by
// Autocab, with the operator's agreement). Implement createBooking,
// getBooking and cancelBooking against that API, keep the return shapes
// described in lib/dispatch/index.js, and run it against the contract in
// taxi-demo/test/dispatch.test.js.

const { DispatchNotConfigured } = require('./index');

const NEEDS = "It needs access to Autocab\"s booking API for this operator (credentials issued by Autocab, with the operator\"s agreement).";

function create() {
  const refuse = async () => { throw new DispatchNotConfigured('Autocab', NEEDS); };
  return {
    name: 'autocab',
    label: 'Autocab',
    configured: () => false,
    createBooking: refuse,
    getBooking: refuse,
    cancelBooking: refuse
  };
}

module.exports = { create };
