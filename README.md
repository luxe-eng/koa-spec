# koa-spec

[![npm version](https://img.shields.io/npm/v/koa-spec.svg)](https://www.npmjs.com/package/koa-spec)
[![Build Status](https://travis-ci.org/luxe-eng/koa-spec.svg?branch=master)](https://travis-ci.org/luxe-eng/koa-spec)
[![Coverage Status](https://coveralls.io/repos/github/luxe-eng/koa-spec/badge.svg?branch=master)](https://coveralls.io/github/luxe-eng/koa-spec?branch=master)
[![Code Climate](https://codeclimate.com/github/luxe-eng/koa-spec/badges/gpa.svg)](https://codeclimate.com/github/luxe-eng/koa-spec)
[![Code Documentation](http://inch-ci.org/github/luxe-eng/koa-spec.svg?branch=master&style=shields)](http://inch-ci.org/github/luxe-eng/koa-spec)
[![Issue Count](https://codeclimate.com/github/luxe-eng/koa-spec/badges/issue_count.svg)](https://codeclimate.com/github/luxe-eng/koa-spec)
[![Dependency Status](https://david-dm.org/luxe-eng/koa-spec.svg)](https://david-dm.org/luxe-eng/koa-spec)
[![npm downloads](https://img.shields.io/npm/dm/koa-spec.svg)](https://www.npmjs.com/package/koa-spec)
[![GitHub Issues](https://img.shields.io/github/issues/luxe-eng/koa-spec.svg)](https://github.com/luxe-eng/koa-spec/issues?q=is%3Aopen)
[![License](https://img.shields.io/npm/l/koa-spec.svg)](LICENSE.txt)

## Installation

```
$ npm install --save koa-spec ⏎
```

## Examples

Various examples can be found in the [/examples](/examples) directory and executed like this:
```bash
$ node examples/simple/app.js ⏎
```

### Basic Example
This is the most simple example showing basic routing (i.e. no parameter or response validation).

#### (data/)api.yaml
```yaml
swagger: '2.0'
info:
  version: 0.0.1
  title: Simple.
paths:
  /:
    get:
      x-controller: IndexController
      x-controller-method: get
      responses:
        200:
          description: OK
```

#### (controllers/)IndexController.js
```javascript
'use strict';

module.exports.get = function* () {
  this.body = { index : 'Hello koa-spec!' };
};
```

#### app.js
```javascript
'use strict';

const koa = require('koa');
const koaspec = require('koa-spec');

const app = koa();

const spec = koaspec('data/api.yaml');
const router = spec.router();
app.use(router.routes());

app.listen(8000);
```

#### Result
```bash
$ curl localhost:8000 ⏎
```
```json
{
  "index" : "Hello koa-spec!"
}
```

## Features/Roadmap

- [x] YAML Parsing
- [x] `$ref` Resolving
  - [x] local
  - [ ] relative
  - [ ] remote
  - [x] circular
- [x] Routing
- [x] Validation
  - [x] Required
  - [x] x-nullable
  - [ ] Parameter
    - [ ] Sources
      - [ ] Header
      - [x] Path
      - [x] Query
      - [x] Body
  - [ ] Response
      - [ ] Header
      - [ ] Body
  - [ ] Types
    - [x] Integer
      - [x] int32 (int)
      - [x] int64 (long)
    - [x] Number
      - [x] float
      - [x] double
    - [ ] String
      - [x] string
      - [ ] byte
      - [ ] binary
      - [x] UUID (V1/V4)
      - [x] ISBN (10/13)
      - [ ] date (ISO8601)
      - [x] date-time (ISO8601)
    - [x] Boolean
      - [x] boolean
  - [ ] Produces
  - [ ] Consumes
- [ ] Error-Handling (throw early, throw often)
- [ ] Spread out `strictMode` usage 
