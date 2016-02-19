'use strict';

const _ = require('lodash');
const fs = require('fs');
const jsonRefs = require('json-refs');
const yaml = require('js-yaml');
const deasync = require('deasync');

module.exports.readSpec = function (source, options) {
  // TODO Support non-files too...
  const file = fs.readFileSync(source, 'utf8');
  const data = yaml.safeLoad(file);
  return resolveRefsSync(data, options).resolved;
};

function resolveRefsSync(spec, options) {
  return deasync(resolveRefs)(spec, options);
}

function resolveRefs(spec, options, cb) {
  jsonRefs.resolveRefs(spec, options || {})
    .then(function (spec) {
      const errs = _.chain(spec.refs).values().each().map('error').compact().value();
      if (errs.length > 0) {
        return cb(new Error(errs));
      } else {
        return cb(null, spec)
      }
    }).catch(function (err) {
    cb(err);
  });
}

module.exports.isDirectory = function (path) {
  try {
    const stats = fs.statSync(path);
    return stats.isDirectory();
  } catch (err) {
    return false;
  }
};

module.exports.isRequireResolvable = function (name) {
  try {
    return require.resolve(name);
  } catch (err) {
    return false;
  }
};