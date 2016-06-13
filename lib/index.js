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
const NullableValidationError = errors.NullableValidationError;
const TypeValidationError = errors.TypeValidationError;
const FormatValidationError = errors.FormatValidationError;

const CONTROLLER_DIRECTORY_DEFAULT = './controllers';
const REQUEST_DEBUG_ERROR_HANDLER_DEFAULT = null;
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
    return function*(next) {
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

  function checkMethodInfo(method, route, methodInfo) {
    // Check if any of the parameters of this method uses a body parameter:
    const bodyParameter = _.find(methodInfo.parameters, {in : 'body'});
    if (bodyParameter) {
      // Make sure the koa-bodyparser is available:
      if (!require('koa-bodyparser')) {
        throw new RouteError(method, route, `Detected 'body' parameter: '${bodyParameter.name}' but module 'koa-bodyparser' isn't available. Install via 'npm install --save koa-bodyparser'.`)
      }
    }
    // Check if any of the parameters of this method uses a formData parameter:
    const formDataParameter = _.find(methodInfo.parameters, {in : 'formData'});
    if (formDataParameter) {
      // Make sure the koa-bodyparser is available:
      if (!require('koa-bodyparser')) {
        throw new RouteError(method, route, `Detected 'formData' parameter: '${formDataParameter.name}' but module 'koa-bodyparser' isn't available. Install via 'npm install --save koa-bodyparser'.`)
      }
    }
  }

  return function () {
    const koarouter = require('koa-router');
    if (!koarouter) {
      throw new RouterError(`Module 'koa-router' isn't available. Install via 'npm install --save koa-router'.`)
    }
    const router = koarouter();

    const controllerDirectory = (options && !_.isUndefined(options.controllerDirectory)) ? options.controllerDirectory : CONTROLLER_DIRECTORY_DEFAULT;
    const requestDebugErrorHandler = (options && !_.isUndefined(options.requestDebugErrorHandler)) ? options.requestDebugErrorHandler : REQUEST_DEBUG_ERROR_HANDLER_DEFAULT;
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
          checkMethodInfo(method, route, methodInfo);

          const requestValidator = createRequestValidator(spec, method, route, methodInfo.parameters, requestDebugErrorHandler);
          router[method](route, requestValidator, controllerMethod);
        } else {
          throw new RouteError(method, route, `Method '${method}' does not exist.`);
        }
      });
    });

    return router;
  }
}

function createRequestValidator(spec, method, route, parameterDefinitions, requestDebugErrorHandler) {
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
      case 'date-time':
        return validateStringDateTime(name, type, format, value, actualValue);
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

  function validateStringDateTime(name, type, format, value, actualValue) {
    /* Performance: ≈4M/sec (2.3 GHz Intel Core i7) */
    if (!/^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/i.test(value)) {
      throw new FormatValidationError(name, type, format, value, `Not a 'date-time' (ISO 8601).`);
    }
    const date = new Date(actualValue);
    return date;
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
      return validateValueType(name, items.type, items.format, items['x-nullable'], undefined, items.properties, items.required, value);
    });
  }

  function validateObject(name, type, format, properties, required, value) {
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

      let propertyValue = value[propertyName];

      /* Check for required properties: */
      if (_.includes(required, propertyName)) {
        if (_.isUndefined(propertyValue)) {
          throw new RequiredValidationError(propertyName, propertyInfo.type, propertyInfo.format, undefined, '');
        }
      } else {
        if (_.isUndefined(propertyValue)) {
          /* Apply default value if defined */
          if (!_.isUndefined(propertyInfo.default)) {
            propertyValue = propertyInfo.default;
          }
          else return;
        }
      }

      const validatedPropertyValue = validateValue(propertyName, propertyInfo.type, propertyInfo.format, propertyInfo['x-nullable'], propertyInfo.items, propertyInfo.properties, propertyInfo.required, propertyValue);
      actualValue[propertyName] = validatedPropertyValue;
    });
    
    return actualValue;
  }

  function validateValue(name, type, format, nullable, items, properties, required, value) {
    if (_.isNull(value)) {
      if (!_.isUndefined(nullable)) {
        if (nullable) {
          return null;
        } else {
          throw new NullableValidationError(name, type, format, value, `Can not be 'null'.`);
        }
      }
    }

    return validateValueType(name, type, format, nullable, items, properties, required, value);
  }

  function validateValueType(name, type, format, nullable, items, properties, required, value) {
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
        return validateObject(name, type, format, properties, required, value);
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
        return validateObject(name, type, format, schema.properties, schema.required, value);
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
          if (!_.isUndefined(parameterDefinition.default)) {
            parameterValue = parameterDefinition.default;
          }
          else return parameterValue;
        }
      }

      if (parameterDefinition.in === 'body') {
        return validateSchema(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, parameterDefinition.schema, parameterValue);
      } else {
        return validateValue(parameterDefinition.name, parameterDefinition.type, parameterDefinition.format, parameterDefinition['x-nullable'], parameterDefinition.items, undefined, undefined, parameterValue);
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
      case 'formData':
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
      };

      if (requestDebugErrorHandler) {
        yield* requestDebugErrorHandler(this, err);
      }
    }
  };
}