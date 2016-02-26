'use strict';

module.exports.getByQueryISBN = function* () {
  this.body = {
    id   : 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    isbn : this.query.isbn
  };
};

module.exports.createFromBody = function* () {
  const body = this.request.body; // TODO Want this to be just "body" not "request.body" ?
  this.body = {
    id      : 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    isbn    : body.isbn,
    authors : body.authors
  };
};

module.exports.createFromBodyArray = function* () {
  const body = this.request.body; // TODO Want this to be just "body" not "request.body" ?
  this.body = [
    {
      id      : 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      isbn    : body[0].isbn,
      authors : body[0].authors
    },
    {
      id      : 'BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF',
      isbn    : body[1].isbn,
      authors : body[1].authors
    }
  ];
};