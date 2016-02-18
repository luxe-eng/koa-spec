'use strict';

const debug = require('debug')('koa-spec-test');
const _ = require('lodash');
const path = require('path');
const mockery = require('mockery');
const koa = require('koa');
const http = require('http');
const HTTPStatus = require('http-status');
const supertest = require('supertest-as-promised');

const koaspec = require('../');
const ERROR_CODES = require('../lib/errors').CODES;

const OPTIONS_TEST = {
  routerOptions : {
    strictMode          : true,
    controllerDirectory : path.join(__dirname, 'controllers')
  }
};

describe('koaspec', function () {
  describe('library', function () {
    it('exposes the spec itself.', function* () {
      const spec = koaspec('test/data/simple.yaml', OPTIONS_TEST);
      expect(spec.spec).to.be.an('object');
    });

    it('exposes the router function.', function* () {
      const spec = koaspec('test/data/simple.yaml', OPTIONS_TEST);
      expect(spec.router).to.be.a('Function');
    });

    it('does not throw when passing no options at all.', function* () {
      const options = null;

      koaspec('test/data/simple.yaml', options);
    });
  });

  describe('parser', function () {
    it('throws trying to parse invalid yaml file.', function* () {
      expect(koaspec.bind(koaspec, 'test/data/invalid_file.yaml', OPTIONS_TEST)).to.throw('YAMLException');
    });

    describe('references', function () {
      it('throws trying to pass invalid refOptions.', function* () {
        const options = {
          refOptions : 'Invalid'
        };

        expect(koaspec.bind(koaspec, 'test/data/simple.yaml', options)).to.throw('options must be an Object'); // TODO Catch and throw nicer error?
      });

      it('throws trying to parse missing $refs.', function () {
        expect(koaspec.bind(koaspec, 'test/data/ref_unknown.yaml', OPTIONS_TEST)).to.throw('#/definitions/Unknown');
      });

      it('dereferences schema $refs.', function () {
        const spec = koaspec('test/data/ref.yaml', OPTIONS_TEST);

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
        const options = _.merge({}, OPTIONS_TEST, {
          refOptions : {
            filter : [/* 'local' */]
          }
        });

        const spec = koaspec('test/data/ref.yaml', options);

        const actual = spec.spec.paths['/'].get.responses['200'].schema;
        const expected = {
          $ref : '#/definitions/Index'
        };
        expect(actual).to.containSubset(expected);
      });
    });
  });

  describe('router', function () {
    describe('dependencies', function () {
      before(function () {
        mockery.enable();
        mockery.warnOnUnregistered(false);
        mockery.registerMock('koa-router', null);
      });

      it('throws when koa-router is not available.', function* () {
        const spec = koaspec('test/data/body_parameter_object.yaml', OPTIONS_TEST);

        expect(spec.router.bind(spec)).to.throw(`koa-router`);
      });

      after(function () {
        mockery.deregisterMock('koa-router');
        mockery.disable();
      });
    });

    it('throws on an unknown method type.', function* () {
      const spec = koaspec('test/data/unknown_method_type.yaml', OPTIONS_TEST);

      expect(spec.router.bind(spec)).to.throw(`Method 'unknown' does not exist.`);
    });

    it('throws for an invalid controller directory.', function* () {
      const options = _.merge({}, OPTIONS_TEST, {
        routerOptions : {
          controllerDirectory : 'invalid'
        }
      });

      const spec = koaspec('test/data/simple.yaml', options);

      expect(spec.router.bind(spec)).to.throw(`Controller directory 'invalid' does not exist.`);
    });

    it('uses the default controller directory.', function* () {
      const options = _.cloneDeep(OPTIONS_TEST);
      delete options.routerOptions.controllerDirectory;

      const spec = koaspec('test/data/simple.yaml', options);

      expect(spec.router.bind(spec)).to.throw(`Controller directory './controllers' does not exist.`);
    });

    it('provides a simple route.', function* () {
      const app = koa();

      const spec = koaspec('test/data/simple.yaml', OPTIONS_TEST);
      const router = spec.router();
      app.use(router.routes());

      const res = yield supertest(http.createServer(app.callback()))
        .get('/')
        .expect(HTTPStatus.OK);

      const actual = res.body;
      const expected = {
        success : true
      };
      expect(actual).to.containSubset(expected);
    });

    it('throws for not implemented routes when strict mode is enabled.', function* () {
      const spec = koaspec('test/data/unknown_controller_method.yaml', OPTIONS_TEST);

      expect(spec.router.bind(spec)).to.throw(`Controller 'IndexController' does not have a method 'getNotImplemented'.`);
    });

    it('throws for controller that can not be found when strict mode is enabled.', function* () {
      const spec = koaspec('test/data/unknown_controller.yaml', OPTIONS_TEST);

      expect(spec.router.bind(spec)).to.throw(`Controller 'UnknownControllerName' does not exist.`);
    });

    it('throws for not defining a controller when strict mode is enabled.', function* () {
      const spec = koaspec('test/data/no_controller.yaml', OPTIONS_TEST);

      expect(spec.router.bind(spec)).to.throw(`Controller 'undefined' does not exist.`);
    });

    it('throws for not defining a controller method when strict mode is enabled.', function* () {
      const spec = koaspec('test/data/no_controller_method.yaml', OPTIONS_TEST);

      expect(spec.router.bind(spec)).to.throw(`Controller 'IndexController' does not have a method 'undefined'.`);
    });

    it('uses strict mode by default.', function* () {
      const options = _.cloneDeep(OPTIONS_TEST);
      delete options.routerOptions.strictMode;

      const spec = koaspec('test/data/unknown_controller_method.yaml', options);
      expect(spec.router.bind(spec)).to.throw(`Controller 'IndexController' does not have a method 'getNotImplemented'.`);
    });

    it('provides fallback for not implemented routes when strict mode is disabled.', function* () {
      const app = koa();

      const options = _.merge({}, OPTIONS_TEST, {
        routerOptions : {
          strictMode : false
        }
      });
      const spec = koaspec('test/data/unknown_controller_method.yaml', options);

      const router = spec.router();
      app.use(router.routes());

      const res = yield supertest(http.createServer(app.callback()))
        .get('/')
        .expect(HTTPStatus.NOT_IMPLEMENTED);

      const actual = res.body;
      const expected = {
        code : ERROR_CODES.ROUTE_NOT_IMPLEMENTED
      };
      expect(actual).to.containSubset(expected);
    });

    it('ignores unknown routes.', function* () {
      const app = koa();

      const spec = koaspec('test/data/simple.yaml', OPTIONS_TEST);

      const router = spec.router();
      app.use(router.routes());

      yield supertest(http.createServer(app.callback()))
        .get('/unknown')
        .expect(HTTPStatus.NOT_FOUND);
    });

    describe('parameter', function () {
      describe.skip('header', function () {
        // TODO ....
      });

      describe('path', function () {
        it('supports a single path parameter.', function* () {
          const app = koa();

          const spec = koaspec('test/data/path_parameter_integer_int32_single.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/items/1')
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            id : 1
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports multiple path parameters.', function* () {
          const app = koa();

          const spec = koaspec('test/data/path_parameter_integer_int32_multiple.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/items/1/2/3')
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            a : 1,
            b : 2,
            c : 3
          };
          expect(actual).to.containSubset(expected);
        });
      });

      describe('query', function () {
        it('supports integer (int32) query parameters.', function* () {
          const app = koa();

          const spec = koaspec('test/data/query_parameter_integer_int32.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/items')
            .query({
              id : 1
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            id : 1
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports integer (int64) query parameters.', function* () {
          const app = koa();

          const spec = koaspec('test/data/query_parameter_integer_int64.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/items')
            .query({
              id : Number.MAX_SAFE_INTEGER
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            id : Number.MAX_SAFE_INTEGER
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports number (float) query parameters.', function* () {
          const app = koa();

          const spec = koaspec('test/data/query_parameter_number_float.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/items')
            .query({
              id : 3.14159
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            id : 3.14159
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports number (double) query parameters.', function* () {
          const app = koa();

          const spec = koaspec('test/data/query_parameter_number_double.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/items')
            .query({
              id : Number.MAX_VALUE
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            id : Number.MAX_VALUE
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports string (uuid) query parameters.', function* () {
          const app = koa();

          const spec = koaspec('test/data/query_parameter_string_uuid.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/items')
            .query({
              id : 'F6751F9E-0E2A-4788-BB97-46BD0E2DF224'
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            id : 'F6751F9E-0E2A-4788-BB97-46BD0E2DF224'
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports string (isbn) query parameters.', function* () {
          const app = koa();

          const spec = koaspec('test/data/query_parameter_string_isbn.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .get('/books')
            .query({
              isbn : '978-1-84951-899-4'
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;
          const expected = {
            isbn : '978-1-84951-899-4'
          };
          expect(actual).to.containSubset(expected);
        });
      });

      describe('body', function () {
        describe('dependencies', function () {
          before(function () {
            mockery.enable();
            mockery.warnOnUnregistered(false);
            mockery.registerMock('koa-bodyparser', null);
          });

          it('throws when koa-bodyparser is not available and calling a  to use the router.', function* () {
            const spec = koaspec('test/data/body_parameter_object.yaml', OPTIONS_TEST);

            expect(spec.router.bind(spec)).to.throw(`koa-bodyparser`);
          });

          after(function () {
            mockery.deregisterMock('koa-bodyparser');
            mockery.disable();
          });
        });

        it('supports simple object body parameters.', function* () {
          const bodyParser = require('koa-bodyparser');
          const app = koa();

          app.use(bodyParser());

          const spec = koaspec('test/data/body_parameter_object.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .post('/books')
            .send({
              isbn : '978-1-84951-899-4'
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;

          const expected = {
            id   : 1,
            isbn : '978-1-84951-899-4'
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports complex object body parameters.', function* () {
          const bodyParser = require('koa-bodyparser');
          const app = koa();

          app.use(bodyParser());

          const spec = koaspec('test/data/body_parameter_object_nested_array.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .post('/books')
            .send({
              isbn    : '978-1-84951-899-4',
              authors : [
                {
                  first_name : 'Schroeder',
                  last_name  : 'Schroeder'
                },
                {
                  first_name : 'Brian',
                  last_name  : 'Broyles'
                }
              ]
            })
            .expect(HTTPStatus.OK);

          const actual = res.body;

          const expected = {
            id      : 1,
            isbn    : '978-1-84951-899-4',
            authors : [
              {
                first_name : 'Schroeder',
                last_name  : 'Schroeder'
              },
              {
                first_name : 'Brian',
                last_name  : 'Broyles'
              }
            ]
          };
          expect(actual).to.containSubset(expected);
        });

        it('supports simple array body parameters.', function* () {
          const bodyParser = require('koa-bodyparser');
          const app = koa();

          app.use(bodyParser());

          const spec = koaspec('test/data/body_parameter_array_nested_array.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .post('/books/many')
            .send([
              {
                isbn    : '978-1-84951-899-4',
                authors : [
                  {
                    first_name : 'Schroeder',
                    last_name  : 'Schroeder'
                  },
                  {
                    first_name : 'Brian',
                    last_name  : 'Broyles'
                  }
                ]
              },
              {
                isbn    : '978-1-78398-596-8',
                authors : [
                  {
                    first_name : 'Maya',
                    last_name  : 'Posch'
                  }
                ]
              }
            ])
            .expect(HTTPStatus.OK);

          const actual = res.body;

          const expected = [{
            id      : 1,
            isbn    : '978-1-84951-899-4',
            authors : [
              {
                first_name : 'Schroeder',
                last_name  : 'Schroeder'
              },
              {
                first_name : 'Brian',
                last_name  : 'Broyles'
              }
            ]
          },
            {
              id      : 2,
              isbn    : '978-1-78398-596-8',
              authors : [
                {
                  first_name : 'Maya',
                  last_name  : 'Posch'
                }
              ]
            }
          ];
          expect(actual).to.containSubset(expected);
        });

        it('supports complex array body parameters.', function* () {
          const bodyParser = require('koa-bodyparser');
          const app = koa();

          app.use(bodyParser());

          const spec = koaspec('test/data/body_parameter_array.yaml', OPTIONS_TEST);

          const router = spec.router();
          app.use(router.routes());

          const res = yield supertest(http.createServer(app.callback()))
            .post('/books/many')
            .send([
              {
                isbn : '978-1-84951-899-4'
              },
              {
                isbn : '978-1-78398-596-8'
              }
            ])
            .expect(HTTPStatus.OK);

          const actual = res.body;

          const expected = [
            {
              id   : 1,
              isbn : '978-1-84951-899-4'
            },
            {
              id   : 2,
              isbn : '978-1-78398-596-8'
            }
          ];
          expect(actual).to.containSubset(expected);
        });
      });
    });

    describe('validation', function () {
      describe('parameter', function () {
        describe.skip('header', function () {
          // TODO ....
        });

        describe.skip('path', function () {
          // TODO ....
        });

        describe('query', function () {
          it('detects a missing required query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int32_required.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({})
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_REQUIRED
            };
            expect(actual).to.containSubset(expected);
          });

          it('allows passing a required query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int32_required.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 1
              })
              .expect(HTTPStatus.OK);

            const actual = res.body;
            const expected = {
              id : 1
            };
            expect(actual).to.containSubset(expected);
          });

          it('allows missing a non required query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int32.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({})
              .expect(HTTPStatus.OK);

            const actual = res.body;
            const expected = {};
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid query parameter type.', function* () {
            const app = koa();

            const spec = koaspec('test/data/invalid_query_parameter_type.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid integer query parameter format.', function* () {
            const app = koa();

            const spec = koaspec('test/data/invalid_query_parameter_format_integer_int96.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid integer query parameter format.', function* () {
            const app = koa();

            const spec = koaspec('test/data/invalid_query_parameter_format_string_ssn.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/citizens')
              .query({
                ssn : '000-00-0000'
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid number query parameter format.', function* () {
            const app = koa();

            const spec = koaspec('test/data/invalid_query_parameter_format_number_tripple.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid query parameter source.', function* () {
            const app = koa();

            const spec = koaspec('test/data/invalid_query_parameter_source.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_SOURCE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid integer query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int32.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 'NotAnIntegerButAString'
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an out of upper bounds integer (int32) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int32.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 2147483647 + 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an out of lower bounds integer (int32) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int32.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : -2147483648 - 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an out of upper bounds integer (int64) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int64.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : Number.MAX_SAFE_INTEGER + 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an out of lower bounds integer (int64) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_integer_int64.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : Number.MIN_SAFE_INTEGER - 1
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid number query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_number_float.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 'NotANumberButAString'
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an out of upper bounds number (float) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_number_float.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 3.4028235E38 * 2
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an out of lower bounds number (float) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_number_float.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : -3.4028235E38 * 2
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid string (uuid) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_string_uuid.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/items')
              .query({
                id : 'NotAUUIDButARandomString'
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid string (isbn) query parameter.', function* () {
            const app = koa();

            const spec = koaspec('test/data/query_parameter_string_isbn.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .get('/books')
              .query({
                isbn : 'NotAISBNButARandomString'
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_FORMAT
            };
            expect(actual).to.containSubset(expected);
          });
        });

        describe('body', function () {
          it('detects an invalid object body parameter.', function* () {
            const bodyParser = require('koa-bodyparser');
            const app = koa();

            app.use(bodyParser());

            const spec = koaspec('test/data/body_parameter_object.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .post('/books')
              .send({
                isbn : 7 // Should be a string!
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects a missing schema in an object body parameter.', function* () {
            const bodyParser = require('koa-bodyparser');
            const app = koa();

            app.use(bodyParser());

            const spec = koaspec('test/data/invalid_body_parameter_object_schema_missing.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .post('/books')
              .send({
                isbn : 7 // Should be a string!
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects a missing schema properties in an object body parameter.', function* () {
            const bodyParser = require('koa-bodyparser');
            const app = koa();

            app.use(bodyParser());

            const spec = koaspec('test/data/invalid_body_parameter_object_properties_missing.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .post('/books')
              .send({
                isbn : 7 // Should be a string!
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects a schema with an invalid type in an object body parameter.', function* () {
            const bodyParser = require('koa-bodyparser');
            const app = koa();

            app.use(bodyParser());

            const spec = koaspec('test/data/invalid_body_parameter_object_schema.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .post('/books')
              .send({
                isbn : 7 // Should be a string!
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid complex object body parameter.', function* () {
            const bodyParser = require('koa-bodyparser');
            const app = koa();

            app.use(bodyParser());

            const spec = koaspec('test/data/body_parameter_object_nested_array.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .post('/books')
              .send({
                isbn    : '978-1-84951-899-4',
                authors : [
                  {
                    first_name : 13, // Should be a string
                    last_name  : 37 // Should be a string
                  }
                ]
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects an invalid array body parameter.', function* () {
            const bodyParser = require('koa-bodyparser');
            const app = koa();

            app.use(bodyParser());

            const spec = koaspec('test/data/body_parameter_array.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .post('/books/many')
              .send({ // Not an array
                isbn : '978-1-84951-899-4'
              })
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });

          it('detects missing items in an array body parameter.', function* () {
            const bodyParser = require('koa-bodyparser');
            const app = koa();

            app.use(bodyParser());

            const spec = koaspec('test/data/invalid_body_parameter_array_items_missing.yaml', OPTIONS_TEST);

            const router = spec.router();
            app.use(router.routes());

            const res = yield supertest(http.createServer(app.callback()))
              .post('/books/many')
              .send([
                {
                  isbn : '978-1-84951-899-4'
                }
              ])
              .expect(HTTPStatus.BAD_REQUEST);

            const actual = res.body;
            const expected = {
              code : ERROR_CODES.VALIDATION_SOURCE_TYPE
            };
            expect(actual).to.containSubset(expected);
          });
        });
      });
    });
  });
});