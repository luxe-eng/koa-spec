'use strict';

module.exports.getByQuerySSN = function* () {
  this.body = {
    ssn : this.query.ssn
  };
};

module.exports.getByDateOfBirth = function* () {
  this.body = {
    date_of_birth : this.query.date_of_birth
  };
};