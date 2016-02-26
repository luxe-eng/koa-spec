'use strict';

module.exports.createFromBody = function* () {
  this.body = this.request.body;
};