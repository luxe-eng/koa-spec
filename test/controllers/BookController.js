'use strict';

module.exports.getByQueryISBN = function* () {
  this.body = {
    id   : 1,
    isbn : this.query.isbn
  };
};

module.exports.createFromBody = function* () {
  const body = this.request.body; // TODO Want this to be just "body" not "request.body" ?
  this.body = {
    id        : 1,
    isbn      : body.isbn,
    format    : body.format,
    authors   : body.authors,
    publisher : body.publisher
  };
};

module.exports.createFromBodyArray = function* () {
  const body = this.request.body; // TODO Want this to be just "body" not "request.body" ?
  this.body = [
    {
      id        : 1,
      isbn      : body[0].isbn,
      authors   : body[0].authors,
      publisher : body.publisher
    },
    {
      id        : 2,
      isbn      : body[1].isbn,
      authors   : body[1].authors,
      publisher : body.publisher
    }
  ];
};