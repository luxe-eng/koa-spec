'use strict';

const debug = require('debug')('koa-spec');
const _ = require('lodash');
const path = require('path');
const HTTPStatus = require('http-status');
const utils = require('./utils');
const parseBoolean = utils.parseBoolean;
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

const INTEGER_INT32_MAX_VALUE = 2147483647;
const INTEGER_INT32_MIN_VALUE = -2147483648;
const INTEGER_INT64_MAX_VALUE = Number.MAX_SAFE_INTEGER;
const INTEGER_INT64_MIN_VALUE = Number.MIN_SAFE_INTEGER;
const NUMBER_FLOAT_MIN_VALUE = -3.4028235E38;
const NUMBER_FLOAT_MAX_VALUE = 3.4028235E38;

module.exports = function (uri, options) {
  const refOptions = (options && options.refOptions) ? options.refOptions : undefined;
  const spec = utils.readSpec(uri, refOptions);

  const routerOptions = (options && options.routerOptions) ? options.routerOptions : undefined;
  const router = createRouter(spec, routerOptions);

  return {
    spec   : spec.resolved,
    refs   : spec.refs,
    router : router
  }
};

function createRouter(spec, options) {
  function getControllerMethod(controllerDirectory, controllerName, controllerMethodName, strictMode, method, route) {
    if (!controllerName) {
      throw new RouteError(method, route, `Controller name not specified. Specify via 'x-controller'.`);
    }

    const controllerPath = path.join(controllerDirectory, controllerName);
    if (!utils.isRequireResolvable(controllerPath)) {
      if (strictMode) {
        throw new RouteError(method, route, `Controller '${controllerName}' does not exist.`);
      }
    } else {
      if (!controllerMethodName) {
        throw new RouteError(method, route, `Controller '${controllerName}' method name not specified. Specify via 'x-controller-method'.`);
      }
      const controller = require(controllerPath);
      const controllerMethod = controller[controllerMethodName];
      if (controllerMethod) {
        return controllerMethod;
      }
      if (strictMode) {
        throw new RouteError(method, route, `Controller '${controllerName}' does not have a method '${controllerMethodName}'.`);
      }
    }

    /* Fallback */
    return createNotImplementedControllerMethod(method, route);
  }

  function createNotImplementedControllerMethod(method, route) {
    return function* (next) {
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
    }
  }

  return function () {
    const koarouter = require('koa-router');
    if (!koarouter) {
      throw new RouterError(`Module 'koa-router' isn't available. Install via 'npm install --save koa-router'.`)
    }
    const router = koarouter();

    const controllerDirectory = (options && !_.isUndefined(options.controllerDirectory)) ? options.controllerDirectory : CONTROLLER_DIRECTORY_DEFAULT;
    const strictMode = (options && !_.isUndefined(options.strictMode)) ? options.strictMode : STRICT_MODE_DEFAULT;

    if (!utils.isDirectory(controllerDirectory)) {
      throw new RouterError(`Controller directory '${controllerDirectory}' does not exist.`);
    }

    const routes = spec.resolved.paths;
    _.forOwn(routes, function (methods, route) {

      /* Convert from spec to router parameter syntax: */
      route = route.replace(/{[^/]*}/g, function replacer(match) {
        /* Cut first and last character, prepend with colon: */
        return ':' + match.slice(1, -1);
      });

      _.forOwn(methods, function (methodInfo, method) {
        const controllerName = methodInfo['x-controller'];
        const controllerMethodName = methodInfo['x-controller-method'];

        const controllerMethod = getControllerMethod(controllerDirectory, controllerName, controllerMethodName, strictMode, method, route);

        if (router[method]) {
          // Check if any of the parameters of this method uses a body parameter:
          const bodyParameter = _.find(methodInfo.parameters, {in : 'body'});
          if (bodyParameter) {
            // Make sure the koa-bodyparser is available:
            if (!require('koa-bodyparser')) {
              throw new RouteError(method, route, `Detected 'body' parameter: '${bodyParameter.name}' but module 'koa-bodyparser' isn't available. Install via 'npm install --save koa-bodyparser'.`)
            }
          }
          const requestValidator = createRequestValidator(spec, method, route, methodInfo.parameters);
          router[method](route, requestValidator, controllerMethod);
        } else {
          throw new RouteError(method, route, `Method '${method}' does not exist.`);
        }
      });
    });

    return router;
  }
}

function createRequestValidator(spec, method, route, parameterDefinitions) {
  function validateBoolean(name, type, format, value) {
    const actualValue = parseBoolean(value);

    if (!_.isBoolean(actualValue)) {
      throw new TypeValidationError(name, type, format, value, `Not a 'boolean'.`);
    }

    return actualValue;
  }

  function validateInteger(name, type, format, value) {
    const actualValue = parseInt(value, 10);

    if (isNaN(actualValue)) {
      throw new TypeValidationError(name, type, format, value, `Not an 'integer'.`);
    } else if (parseFloat(value) % 1 !== 0) { // Checks if this actually was a float, not an integer!
      throw new TypeValidationError(name, type, format, value, `Not an 'integer'.`);
    }

    switch (format) {
      case 'int32':
        return validateIntegerInt32(name, type, format, value, actualValue);
      case 'int64':
        return validateIntegerInt64(name, type, format, value, actualValue);
      default:
        throw new FormatValidationError(name, type, format, value, `Unknown format: ${format}.`);
    }
  }

  function validateIntegerInt32(name, type, format, value, actualValue) {
    if (actualValue > INTEGER_INT32_MAX_VALUE) {
      throw new FormatValidationError(name, type, format, value, `Maximum integer (int32) value: ${INTEGER_INT32_MAX_VALUE}.`);
    } else if (actualValue < INTEGER_INT32_MIN_VALUE) {
      throw new FormatValidationError(name, type, format, value, `Minimum integer (int32) value: ${INTEGER_INT32_MIN_VALUE}.`);
    }
    return actualValue;
  }

  function validateIntegerInt64(name, type, format, value, actualValue) {
    if (actualValue > INTEGER_INT64_MAX_VALUE) {
      throw new FormatValidationError(name, type, format, value, `Maximum integer (int64) value: ${INTEGER_INT64_MAX_VALUE}.`);
    } else if (actualValue < INTEGER_INT64_MIN_VALUE) {
      throw new FormatValidationError(name, type, format, value, `Minimum integer (int64) value: ${INTEGER_INT64_MIN_VALUE}.`);
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
        return validateNumberFloat(name, type, format, value, actualValue);
      case 'double':
        return validateNumberDouble(name, type, format, value, actualValue);
      default:
        throw new FormatValidationError(name, type, format, value, `Unknown format: ${format}.`);
    }
  }

  function validateNumberFloat(name, type, format, value, actualValue) {
    if (actualValue > NUMBER_FLOAT_MAX_VALUE) {
      throw new FormatValidationError(name, type, format, value, `Maximum number (float) value: ${NUMBER_FLOAT_MAX_VALUE}.`);
    } else if (actualValue < NUMBER_FLOAT_MIN_VALUE) {
      throw new FormatValidationError(name, type, format, value, `Minimum number (float) value: ${NUMBER_FLOAT_MIN_VALUE}.`);
    }
    return actualValue;
  }

  function validateNumberDouble(name, type, format, value, actualValue) {
    return actualValue;
  }

  function validateString(name, type, format, value) {
    const actualValue = value;
    if (!_.isString(actualValue)) {
      throw new TypeValidationError(name, type, format, value, `Not a 'string'.`);
    }

    switch (format) {
      case undefined:
        // No specified format means a simple string. Nothing to check for here.
        return actualValue;
      case 'uuid':
        return validateStringUUID(name, type, format, value, actualValue);
      case 'isbn':
        return validateStringISBN(name, type, format, value, actualValue);
      default:
        throw new FormatValidationError(name, type, format, value, `Unknown format: ${format}.`);
    }
  }

  function validateStringUUID(name, type, format, value, actualValue) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new FormatValidationError(name, type, format, value, `Not a 'uuid'.`);
    }
    return actualValue;
  }

  function validateStringISBN(name, type, format, value, actualValue) {
    if (!/^(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/i.test(value)) {
      throw new FormatValidationError(name, type, format, value, `Not a 'isbn'.`);
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
    const refName = items['$ref'];
    if (refName) {
      const ref = spec.refs[`${refName}/properties/${name}/items`];
      items = _.get(spec.resolved, utils.pathFromPtr(ref.uri).join('.'));
    }

    return _.map(values, value => {
      return validateProperties(name, type, format, items.properties, items.required, value);
    });
  }

  function validateProperties(name, type, format, properties, required, value) {
    const actualValue = {};
    if (!properties) {
      throw new TypeValidationError(name, type, format, value, `Properties not found.`);
    }

    _.forOwn(properties, (propertyInfo, propertyName) => {
      const refName = propertyInfo['$ref'];
      if (refName) {
        const ref = spec.refs[`${refName}/properties/${propertyName}`];
        propertyInfo = _.get(spec.resolved, utils.pathFromPtr(ref.uri).join('.'));
      }

      const propertyValue = value[propertyName];
      /* Check for required properties: */
      if (_.includes(required, propertyName)) {
        if (_.isUndefined(propertyValue)) {
          throw new RequiredValidationError(propertyName, propertyInfo.type, propertyInfo.format, undefined, '');
        }
      } else {
        if (_.isUndefined(propertyValue)) {
          return;
        }
      }

      const validatedPropertyValue = validateValue(propertyName, propertyInfo.type, propertyInfo.format, propertyInfo.items, propertyInfo.properties, propertyInfo.required, propertyValue);
      actualValue[propertyName] = validatedPropertyValue;
    });
    return actualValue;
  }

  function validateValue(name, type, format, items, properties, required, value) {
    switch (type) {
      case 'boolean':
        return validateBoolean(name, type, format, value);
      case 'integer':
        return validateInteger(name, type, format, value);
      case 'number':
        return validateNumber(name, type, format, value);
      case 'string':
        return validateString(name, type, format, value);
      case 'object':
        return validateProperties(name, type, format, properties, required, value);
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
        return validateProperties(name, type, format, schema.properties, schema.required, value);
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
        return validateValue(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, parameterDefinition.items, undefined, undefined, parameterValue);
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
    if (parameterDefinition.in === 'body') {
      ctx.request.body = validatedParameterValue;
    } else {
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
        return ctx.request.body;
      default:
        throw new ParameterValidationError(parameterDefinition, undefined, new SourceValidationError(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, undefined, `Unknown source: '${parameterDefinition.in}'.`));
    }
  }

  function validateParameters(ctx) {
    _.forEach(parameterDefinitions, parameterDefinition => {
      const parameterValue = getParameterValue(ctx, parameterDefinition);
      const validatedParameterValue = validateParameter(parameterDefinition, parameterValue);
      setParameterValue(ctx, parameterDefinition, validatedParameterValue);
    });
  }

  return function* validateRequest(next) {
    try {
      validateParameters(this);

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