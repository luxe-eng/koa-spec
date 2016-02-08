'use strict';

const utils = require('./utils');

module.exports = function (uri, options) {
  const refOptions = (options && options.refOptions) ? options.refOptions : undefined;
  const spec = utils.readSpec(uri, refOptions);

  const routes = function routes() {
    return function* routes(next) {
      if ('/answer' == this.path) {
        this.body = 42;
      } else {
        yield next;
      }
    }
  };

  return {
    spec   : spec,
    routes : routes
  }
};