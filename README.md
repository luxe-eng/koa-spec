# koa-spec

[![npm version](https://img.shields.io/npm/v/koa-spec.svg)](https://www.npmjs.com/package/koa-spec)
[![Build Status](https://travis-ci.org/luxe-eng/koa-spec.svg?branch=master)](https://travis-ci.org/luxe-eng/koa-spec)
[![Coverage Status](https://coveralls.io/repos/github/luxe-eng/koa-spec/badge.svg?branch=master)](https://coveralls.io/github/luxe-eng/koa-spec?branch=master)
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

#### api.yaml
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

#### IndexController.js
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
const koaspec = require('../..'); // 'koa-spec'

const app = koa();

const OPTIONS = { routerOptions : { controllerDirectory : __dirname + '/controllers' } };

const spec = koaspec(__dirname + '/data/api.yaml', OPTIONS);
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
