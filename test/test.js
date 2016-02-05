'use strict';

const koaspec = require('../');

describe('koaspec', function () {
  it('returns the answer to life the universe and everything.', function () {
    expect(koaspec()).to.be.eql(42);
  });
});