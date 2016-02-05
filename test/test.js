'use strict';

const koa = require('koa');
const http = require('http');
const HTTPStatus = require('http-status');
const koaspec = require('../');
const supertest = require('supertest-as-promised');

describe('koaspec', function () {
  describe('parsing', function () {
    it('throws trying to parse invalid yaml file.', function* () {
      expect(koaspec.bind(koaspec, 'test/data/invalid.yaml')).to.throw('YAMLException');
    });

    describe('references', function () {
      it('throws trying to pass invalid refOptions.', function* () {
        const options = {
          refOptions : 'Invalid'
        };

        expect(koaspec.bind(koaspec, 'test/data/simple.yaml', options)).to.throw('options must be an Object');
      });

      it('throws trying to parse missing $refs.', function () {
        expect(koaspec.bind(koaspec, 'test/data/simple_ref_unknown.yaml')).to.throw('#/definitions/Unknown');
      });

      it('dereferences schema $refs.', function () {
        const spec = koaspec('test/data/simple_ref.yaml');

        const actual = spec.spec.paths['/'].get.responses['200'].schema;
        const expected = {
          title      : 'Index',
          type       : 'object',
          properties : {
            hello : {
              type    : 'string',
              example : 'world'
            }
          }
        };
        expect(actual).to.containSubset(expected);
      });

      it('does not dereference local references if not asked to.', function* () {
        const options = {
          refOptions : {
            filter : [/* 'local' */]
          }
        };

        const spec = koaspec('test/data/simple_ref.yaml', options);

        const actual = spec.spec.paths['/'].get.responses['200'].schema;
        const expected = {
          $ref : "#/definitions/Index"
        };
        expect(actual).to.containSubset(expected);
      });
    });
  });

  describe('routes', function () {
    it('returns the answer to life the universe and everything.', function* () {
      const app = koa();

      const spec = koaspec('test/data/simple.yaml');

      app.use(spec.routes());

      // TODO Make this check for the actual endpoint of the simple spec!

      const res = yield supertest(http.createServer(app.callback()))
        .get('/answer')
        .expect(HTTPStatus.OK);

      expect(res.body).to.eql(42);
    });

    it('ignores calling unknown routes.', function* () {
      const app = koa();

      const spec = koaspec('test/data/simple.yaml');

      app.use(spec.routes());

      yield supertest(http.createServer(app.callback()))
        .get('/unknown')
        .expect(HTTPStatus.NOT_FOUND);
    });
  });
})
;