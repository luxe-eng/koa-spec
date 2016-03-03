'use strict';

module.exports.getByQueryId = function* () {
  this.body = {
    id : this.query.id
  };
};

module.exports.getByFormDataId = function* () {
  this.body = {
    id : this.request.body.id
  };
};

module.exports.getByPathId = function* () {
  this.body = {
    id : this.params.id
  };
};

module.exports.getByPathABC = function* () {
  this.body = {
    a : this.params.a,
    b : this.params.b,
    c : this.params.c
  };
};