'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiSubset = require('chai-subset');

chai.config.includeStack = true;

chai.use(chaiAsPromised);
chai.use(chaiSubset);

global.chaiAsPromised = chaiAsPromised;
global.expect = chai.expect;