'use strict';

module.exports.getByQuerySSN = function* () {
  this.body = {
    ssn : this.query.ssn
  };
};