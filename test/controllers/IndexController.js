'use strict';

module.exports.get = function* () {
  this.body = {
    success : true
  };
};

module.exports.get404 = function* () {
  this.status = 404;
  this.body = {
    success : false
  };
};

module.exports.getInvalidResponse = function* () {
  this.body = {
    success : 'NotABoolean'
  };
};