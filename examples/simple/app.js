'use strict';

const path = require('path');
const koa = require('koa');
const koaspec = require('../..'); // 'koa-spec'

const app = koa();

const OPTIONS = { routerOptions : { controllerDirectory : path.join(__dirname, '/controllers') } };

const spec = koaspec(path.join(__dirname, '/data/api.yaml'), OPTIONS);
const router = spec.router();
app.use(router.routes());

app.listen(8000);