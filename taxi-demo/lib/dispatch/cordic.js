'use strict';

// Cordic driver: the slot for a real Cordic connection. Not written yet,
// and deliberately so: it refuses every call rather than pretending a
// booking went through. To connect an operator on Cordic it needs access to
// Cordic's booking interface for this operator (arranged with Cordic, with
// the operator's agreement). Implement createBooking, getBooking and
// cancelBooking against that API, keep the return shapes described in
// lib/dispatch/index.js, and run it against the contract in taxi-
// demo/test/dispatch.test.js.

const { DispatchNotConfigured } = require('./index');

const NEEDS = "It needs access to Cordic\"s booking interface for this operator (arranged with Cordic, with the operator\"s agreement).";

function create() {
  const refuse = async () => { throw new DispatchNotConfigured('Cordic', NEEDS); };
  return {
    name: 'cordic',
    label: 'Cordic',
    configured: () => false,
    createBooking: refuse,
    getBooking: refuse,
    cancelBooking: refuse
  };
}

module.exports = { create };
