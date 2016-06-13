'use strict';

/*
 * This example shows a custom request debug error handler.
 * For demonstration purposes we will change the error code (if there were errors thrown)
 * from 400 (BAD_REQUEST) to 418 (IM_A_TEAPOT) on every 1337th request error.
 *
 * Typically this can be used to redirect request error logging to custom logging facilities.
 */

const path = require('path');
const koa = require('koa');
const koaspec = require('../..'); // 'koa-spec'

const app = koa();

let errorCount = 0;
const OPTIONS = {
  routerOptions : {
    controllerDirectory      : path.join(__dirname, '/controllers'),
    requestDebugErrorHandler : function*(ctx, err) {
      console.err(err);

      errorCount++;
      if (errorCount % 1337 === 0) {
        ctx.status = 418;
        ctx.body = `I'm a teapot!`;
      }
    }
  }
};

const spec = koaspec(path.join(__dirname, '/data/api.yaml'), OPTIONS);
const router = spec.router();
app.use(router.routes());

app.listen(8000);