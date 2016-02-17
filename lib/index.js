'use strict';

const debug = require('debug')('koa-spec');
const _ = require('lodash');
const path = require('path');
const HTTPStatus = require('http-status');
const utils = require('./utils');
const errors = require('./errors');

const RouterError = errors.RouterError;

const RouteError = errors.RouteError;
const RouteNotImplementedError = errors.RouteNotImplementedError;

const ParameterValidationError = errors.ParameterValidationError;

const SourceValidationError = errors.SourceValidationError;
const RequiredValidationError = errors.RequiredValidationError;
const TypeValidationError = errors.TypeValidationError;
const FormatValidationError = errors.FormatValidationError;

const CONTROLLER_DIRECTORY_DEFAULT = './controllers';
const STRICT_MODE_DEFAULT = true;

module.exports = function (uri, options) {
  const refOptions = (options && options.refOptions) ? options.refOptions : undefined;
  const spec = utils.readSpec(uri, refOptions);

  const routerOptions = (options && options.routerOptions) ? options.routerOptions : undefined;
  const router = createRouter(spec, routerOptions);

  return {
    spec   : spec,
    router : router
  }
};

function createRouter(spec, options) {
  return function () {
    const router = require('koa-router')();

    const controllerDirectory = (options && !_.isUndefined(options.controllerDirectory)) ? options.controllerDirectory : CONTROLLER_DIRECTORY_DEFAULT;
    const strictMode = (options && !_.isUndefined(options.strictMode)) ? options.strictMode : STRICT_MODE_DEFAULT;

    if (!utils.isDirectory(controllerDirectory)) {
      throw new RouterError(`Controller directory '${controllerDirectory}' does not exist.`);
    }

    const routes = spec.paths;
    _.forOwn(routes, function (methods, route) {

      /* Convert from spec to router parameter syntax: */
      route = route.replace(/{[^/]*}/g, function replacer(match) {
        /* Cut first and last character, prepend with colon: */
        return ':' + match.slice(1, -1);
      });

      _.forOwn(methods, function (methodInfo, method) {
        const controllerName = methodInfo['x-controller'];
        const controllerMethodName = methodInfo['x-controller-method'];

        let controller;
        let controllerMethod;
        if (controllerName) {
          const controllerPath = path.join(controllerDirectory, controllerName);
          try {
            controller = require(controllerPath);
            controllerMethod = controller[controllerMethodName];
          } catch (err) {
            debug(err); // Properly handled below!
          }
        }

        if (!controllerMethod) {
          if (strictMode) {
            if (!controller) {
              throw new RouteError(method, route, `Controller '${controllerName}' does not exist.`);
            } else {
              throw new RouteError(method, route, `Controller '${controllerName}' does not have a method '${controllerMethodName}'.`);
            }
          } else {
            controllerMethod = function* (next) {
              this.status = HTTPStatus.NOT_IMPLEMENTED;
              const err = new RouteNotImplementedError(method, route);
              this.body = {
                code    : err.code,
                message : err.message,
                route   : {
                  method : method,
                  path   : route
                }
              };
            };
          }
        }

        if (router[method]) {
          const requestValidator = createRequestValidator(method, route, methodInfo.parameters);
          router[method](route, requestValidator, controllerMethod);
        } else {
          throw new RouteError(method, route, `Method '${method}' does not exist.`);
        }
      });
    });

    return router;
  }
}

function createRequestValidator(method, route, parameterDefinitions) {
  function validateInteger(name, type, format, value) {
    const actualValue = parseInt(value, 10);

    if (isNaN(actualValue)) {
      throw new TypeValidationError(name, type, format, value, `Not an 'integer'.`);
    }
    // TODO Detect if float was passed!

    switch (format) {
      case 'int32':
      {
        if (actualValue > 2147483647) { // Integer.MAX_VALUE
          throw new FormatValidationError(name, type, format, value, `Maximum: ${2147483647}.`);
        } else if (actualValue < -2147483648) { // Integer.MIN_VALUE
          throw new FormatValidationError(name, type, format, value, `Minimum: ${-2147483648}.`);
        }
        break;
      }
      case 'int64':
      {
        if (actualValue > Number.MAX_SAFE_INTEGER) {
          throw new FormatValidationError(name, type, format, value, `Maximum: ${Number.MAX_SAFE_INTEGER}.`);
        } else if (actualValue < Number.MIN_SAFE_INTEGER) {
          throw new FormatValidationError(name, type, format, value, `Minimum: ${Number.MIN_SAFE_INTEGER}.`);
        }
        break;
      }
      default:
        throw new FormatValidationError(name, type, format, value, `Unknown format: ${format}.`);
    }

    return actualValue;
  }

  function validateNumber(name, type, format, value) {
    const actualValue = parseFloat(value);
    if (isNaN(actualValue)) {
      throw new TypeValidationError(name, type, format, value, `Not a 'number'.`);
    }

    switch (format) {
      case 'float':
      {
        if (actualValue > 3.4028235E38) {
          throw new FormatValidationError(name, type, format, value, `Maximum: ${3.4028235E38}.`);
        } else if (actualValue < -3.4028235E38) {
          throw new FormatValidationError(name, type, format, value, `Minimum: ${-3.4028235E38}.`);
        }
        break;
      }
      case 'double':
      {
        break;
      }
      default:
        throw new FormatValidationError(name, type, format, value, `Unknown format: ${format}.`);
    }

    return actualValue;
  }

  function validateString(name, type, format, value) {
    const actualValue = value;
    if (!_.isString(actualValue)) {
      throw new TypeValidationError(name, type, format, value, `Not a 'string'.`);
    }

    if (format) {
      switch (format) {
        case 'uuid':
        {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
            throw new FormatValidationError(name, type, format, value, `Not a 'uuid'.`);
          }
          break;
        }
        case 'isbn':
        {
          if (!/^(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/i.test(value)) {
            throw new FormatValidationError(name, type, format, value, `Not a 'isbn'.`);
          }
          break;
        }
        default:
          throw new FormatValidationError(name, type, format, value, `Unknown format: ${format}.`);
      }
    }

    return actualValue;
  }

  function validateArray(name, type, format, items, values) {
    if (!_.isArray(values)) {
      throw new TypeValidationError(name, type, format, values, `Not an 'array'.`);
    }
    if (!items) {
      throw new TypeValidationError(name, type, format, values, `Items not found.`);
    }

    return _.map(values, value => {
      return validateProperties(name, type, format, items.properties, value);
    });
  }

  function validateProperties(name, type, format, properties, value) {
    const actualValue = {};
    if (!properties) {
      throw new TypeValidationError(name, type, format, value, `Properties not found.`);
    }

    _.forOwn(properties, (propertyInfo, propertyName) => {
      const validatedPropertyValue = validateValue(propertyName, propertyInfo.type, propertyInfo.format, propertyInfo.items, value[propertyName]);
      actualValue[propertyName] = validatedPropertyValue;
    });
    return actualValue;
  }

  function validateValue(name, type, format, items, value) {
    switch (type) {
      case 'integer':
        return validateInteger(name, type, format, value);
      case 'number':
        return validateNumber(name, type, format, value);
      case 'string':
        return validateString(name, type, format, value);
      case 'array':
        return validateArray(name, type, format, items, value);
      default:
        throw new TypeValidationError(name, type, format, value, `Unsupported type: '${type}'.`);
    }
  }

  function validateSchema(name, type, format, schema, value) {
    if (!schema) {
      throw new TypeValidationError(name, type, format, value, `Schema not found.`);
    }

    switch (schema.type) {
      case 'object':
        return validateProperties(name, type, format, schema.properties, value);
      case 'array':
        return validateArray(name, type, format, schema.items, value);
      default:
        throw new TypeValidationError(name, type, format, value, `Unsupported schema type: '${schema.type}'.`);
    }
  }

  function validateParameter(parameterDefinition, parameterValue) {
    try {
      if (parameterDefinition.required) {
        if (_.isUndefined(parameterValue)) {
          throw new RequiredValidationError(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, undefined, '');
        }
      } else {
        if (_.isUndefined(parameterValue)) {
          return parameterValue;
        }
      }

      if (parameterDefinition.in === 'body') {
        return validateSchema(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, parameterDefinition.schema, parameterValue);
      } else {
        return validateValue(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, parameterDefinition.items, parameterValue);
      }
    } catch (err) {
      throw new ParameterValidationError(parameterDefinition, parameterValue, err);
    }
  }

  function getParameterValue(ctx, parameterDefinition) {
    const parameterSource = getRequestParameterSource(ctx, parameterDefinition);
    switch (parameterDefinition.in) {
      case 'body':
        return parameterSource;
      default:
        return parameterSource[parameterDefinition.name];
    }
  }

  function setParameterValue(ctx, parameterDefinition, validatedParameterValue) {
    switch (parameterDefinition.in) {
      case 'body':
        ctx.request.body = validatedParameterValue;
        break;
      default:
        const parameterSource = getRequestParameterSource(ctx, parameterDefinition);
        parameterSource[parameterDefinition.name] = validatedParameterValue;
    }
  }

  function getRequestParameterSource(ctx, parameterDefinition) {
    switch (parameterDefinition.in) {
      case 'path':
        return ctx.params;
      case 'query':
        return ctx.query;
      case 'body':
        return ctx.request.body; // TODO Throw if body doesn't exist (aka koa-bodyparser wasn't installed)
      default:
        throw new ParameterValidationError(parameterDefinition, undefined, new SourceValidationError(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, undefined, `Unknown source: '${parameterDefinition.in}'.`));
    }
  }

  return function* validateRequest(next) {
    try {
      _.forEach(parameterDefinitions, parameterDefinition => {
        const parameterValue = getParameterValue(this, parameterDefinition);
        const validatedParameterValue = validateParameter(parameterDefinition, parameterValue);
        setParameterValue(this, parameterDefinition, validatedParameterValue);
      }, []);

      yield next;
    } catch (err) {
      debug(err);

      this.status = HTTPStatus.BAD_REQUEST;
      this.body = {
        code      : err.code,
        message   : err.message,
        route     : {
          method : method,
          path   : route
        },
        parameter : {
          expected : err.parameterDefinition,
          actual   : err.parameterValue
        }
      }
    }
  };
}