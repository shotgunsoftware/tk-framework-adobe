(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.JRPC = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*! JRPC v3.1.0
 * <https://github.com/vphantom/js-jrpc>
 * Copyright 2016 Stéphane Lavergne
 * Free software under MIT License: <https://opensource.org/licenses/MIT> */

'use strict';

global.setImmediate = require('timers').setImmediate;

/**
 * Constructor
 *
 * @typedef {Object} JRPC
 *
 * @param {Object} [options] Options to initialize with
 *
 * @return {undefined} No return value
 */
function JRPC(options) {
  this.active = true;
  this.transmitter = null;
  this.remoteTimeout = 60000;
  this.localTimeout = 0;
  this.serial = 0;
  this.discardSerial = 0;
  this.outbox = {
    requests : [],
    responses: []
  };
  this.inbox = {};
  this.localTimers = {};
  this.outTimers = {};
  this.localComponents = {
    'system.listComponents'      : true,
    'system.extension.dual-batch': true
  };
  this.remoteComponents = {};
  this.exposed = {};

  this.exposed['system.listComponents'] = (function(params, next) {
    if (typeof params === 'object' && params !== null) {
      this.remoteComponents = params;
      this.remoteComponents['system._upgraded'] = true;
    }
    return next(null, this.localComponents);
  }).bind(this);

  this.exposed['system.extension.dual-batch'] = function(params, next) {
    return next(null, true);
  };

  if (typeof options === 'object') {
    if (
      'remoteTimeout' in options
      && typeof options['remoteTimeout'] === 'number'
    ) {
      this.remoteTimeout = options['remoteTimeout'] * 1000;
    }

    if (
      'localTimeout' in options
      && typeof options['localTimeout'] === 'number'
    ) {
      this.localTimeout = options['localTimeout'] * 1000;
    }
  }
}

/**
 * Semi-destructor for limbo conditions
 *
 * When we lose connection permanently, we help garbage collection by removing
 * as many references as we can, including cancelling any outstanding timers.
 * We may still get some callbacks, but they will immediately return.
 *
 * @return {undefined} No return value
 */
function shutdown() {
  var instance = this;

  instance.active = false;
  instance.transmitter = null;
  instance.remoteTimeout = 0;
  instance.localTimeout = 0;
  instance.localComponents = {};
  instance.remoteComponents = {};
  instance.outbox.requests.length = 0;
  instance.outbox.responses.length = 0;
  instance.inbox = {};
  instance.exposed = {};

  Object.keys(instance.localTimers).forEach(function(key) {
    clearTimeout(instance.localTimers[key]);
    delete instance.localTimers[key];
  });

  Object.keys(instance.outTimers).forEach(function(key) {
    clearTimeout(instance.outTimers[key]);
    delete instance.outTimers[key];
  });

  return instance;
}


// I/O

/**
 * Send a message if there is something in the queue
 *
 * @param {JRPC~transmitCallback} callback Transmission handler
 *
 * @return {JRPC} This instance, for chaining
 */
function transmit(callback) {
  // Will call next(data, next)
  // Expect OUR next to be called with (err) so we know if it worked
  var iRes;
  var iReq;
  var msg = null;
  var outpacket = {
    responses: [],
    requests : []
  };

  if (typeof callback !== 'function') {
    callback = this.transmitter;
  }
  if (!this.active || typeof callback !== 'function') {
    return this;
  }

  iRes = this.outbox.responses.length;
  iReq = this.outbox.requests.length;
  if (
    iRes > 0
    && iReq > 0
    && 'system.extension.dual-batch' in this.remoteComponents
  ) {
    // Use dual-batch extension to send it all at once
    outpacket = msg = {
      responses: this.outbox.responses,
      requests : this.outbox.requests
    };
    // Setting length=0 would preserve references and we want to renew them
    this.outbox.responses = [];
    this.outbox.requests = [];
  } else if (iRes > 0) {
    // Responses have priority over requests
    if (iRes > 1) {
      outpacket.responses = msg = this.outbox.responses;
      this.outbox.responses = [];
    } else {
      outpacket.responses.push(msg = this.outbox.responses.pop());
    }
  } else if (iReq > 0) {
    if (iReq > 1) {
      outpacket.requests = msg = this.outbox.requests;
      this.outbox.requests = [];
    } else {
      outpacket.requests.push(msg = this.outbox.requests.pop());
    }
  } else {
    return this;
  }

  // Send msg using callback
  setImmediate(
    callback,
    JSON.stringify(msg),
    confirmTransmit.bind(this, outpacket)
  );

  return this;
}

/**
 * Callback invoked by transmit()
 *
 * @callback JRPC~transmitCallback
 *
 * @param {string} msg                        Message to send out
 * @param {JRPC~transmitConfirmCallback} next Callback handling errors
 */

/**
 * Set transmitter callback permanently
 *
 * @param {JRPC~transmitCallback} callback Transmission handler
 *
 * @return {JRPC} This instance, for chaining
 */
function setTransmitter(callback) {
  this.transmitter = callback;
  return this.transmit();
}

/**
 * Handle transmission errors
 *
 * @type {JRPC~transmitConfirmCallback}
 *
 * @param {Object}  outpacket Outbox data of the attempted transmission
 * @param {boolean} err       Anything non-falsey means an error occured
 *
 * @return {undefined} No return value
 */
function confirmTransmit(outpacket, err) {
  if (this.active && err) {
    // Roll it all back into outbox (which may not be empty anymore)
    if (outpacket.responses.length > 0) {
      Array.prototype.push.apply(this.outbox.responses, outpacket.responses);
    }
    if (outpacket.requests.length > 0) {
      Array.prototype.push.apply(this.outbox.requests, outpacket.requests);
    }
  }
}

/**
 * Handle incoming message
 *
 * @param {string} msg JSON message to parse
 *
 * @return {JRPC} This instance, for chaining
 */
function receive(msg) {
  var requests = [];
  var responses = [];

  if (!this.active) {
    return this;
  }

  // If we got JSON, parse it
  if (typeof msg === 'string') {
    try {
      msg = JSON.parse(msg);
    } catch (e) {
      // The specification doesn't force us to respond in error, ignoring
      return this;
    }
  }

  // If we get a standard single-type batch, dispatch it
  if (msg.constructor === Array) {
    if (msg.length === 0) {
      return this;
    }
    // Hint of request batch
    if (typeof msg[0].method === 'string') {
      requests = msg;
    } else {
      responses = msg;
    }
  } else if (typeof msg === 'object') {
    // Could we be a 'dual-batch' extended message?
    if (
      typeof msg.requests !== 'undefined'
      && typeof msg.responses !== 'undefined'
    ) {
      requests = msg.requests;
      responses = msg.responses;
    } else if (typeof msg.method === 'string') {
      // We're a single request
      requests.push(msg);
    } else {
      // We must be a single response
      responses.push(msg);
    }
  }

  responses.forEach(deliverResponse.bind(this));
  requests.forEach(serveRequest.bind(this));
  return this;
}

/**
 * Handshake to discover remote extended capabilities
 *
 * @return {JRPC} This instance, for chaining
 */
function upgrade() {
  if (!this.active) {
    return this;
  }
  return this.call(
    'system.listComponents',
    this.localComponents,
    (function(err, result) {
      if (!err && typeof result === 'object') {
        this.remoteComponents = result;
        this.remoteComponents['system._upgraded'] = true;
      }
    }).bind(this)
  );
}


// Client side

/**
 * Queue up a remote method call
 *
 * @param {string}               methodName Name of method to call
 * @param {(Object|Array|null)}  [params]   Parameters
 * @param {JRPC~receiveCallback} [next]     Callback to receive result
 *
 * @return {JRPC} This instance, for chaining
 */
function call(methodName, params, next) {
  var request = {
    jsonrpc: '2.0',
    method : methodName
  };

  if (!this.active) {
    return this;
  }

  if (typeof params === 'function') {
    next = params;
    params = null;
  }

  if (
    'system._upgraded' in this.remoteComponents
    && !(methodName in this.remoteComponents)
  ) {
    // We're upgraded, yet method name isn't found, immediate error!
    if (typeof next === 'function') {
      setImmediate(next, {
        code   : -32601,
        message: 'Unknown remote method'
      });
    }
    return this;
  }

  this.serial++;
  request.id = this.serial;
  if (typeof params === 'object') {
    request.params = params;
  }

  if (typeof next === 'function') {
    this.inbox[this.serial] = next;
  }
  this.outbox.requests.push(request);

  // If we're interactive, send the new request
  this.transmit();

  if (typeof next !== 'function') {
    return this;
  }
  if (this.remoteTimeout > 0) {
    this.outTimers[this.serial] = setTimeout(
      deliverResponse.bind(
        this,
        {
          jsonrpc: '2.0',
          id     : this.serial,
          error  : {
            code   : -1000,
            message: 'Timed out waiting for response'
          }
        },
        true
      ),
      this.remoteTimeout
    );
  } else {
    this.outTimers[this.serial] = true;  // Placeholder
  }

  return this;
}

/**
 * Callback invoked when remote results are ready
 *
 * @callback JRPC~receiveCallback
 *
 * @param {boolean} err    True if the result is an error or unavailable
 * @param {Object}  result The result from the remote method
 *
 * @return {undefined} No return value
 */

/**
 * Deliver a received result
 *
 * @param {Object}  res     The single result to parse
 * @param {boolean} timeout We come from a timeout
 *
 * @return {undefined} No return value
 */
function deliverResponse(res, timeout) {
  var err = false;
  var result = null;

  if (this.active && 'id' in res && res['id'] in this.outTimers) {
    if (timeout === true) {
      clearTimeout(this.outTimers[res['id']]);
    }
    delete this.outTimers[res['id']];
  } else {
    // Silently ignoring second response to same request
    return;
  }

  if ('id' in res && res['id'] in this.inbox) {
    if ('error' in res) {
      err = res['error'];
    } else {
      result = res['result'];
    }
    setImmediate(this.inbox[res['id']], err, result);
    delete this.inbox[res['id']];
  }
  // Silently ignore timeout duplicate and malformed responses
}


// Server side

/**
 * Expose a single or collection of methods to remote end
 *
 * @param {(Object|String)}      subject    Name of method or direct object
 * @param {JRPC~serviceCallback} [callback] Callback to handle requests
 *
 * @return {JRPC} This instance, for chaining
 */
function expose(subject, callback) {
  var name;

  if (!this.active) {
    return this;
  }

  if (typeof subject === 'string') {
    this.localComponents[subject] = true;
    this.exposed[subject] = callback;
  } else if (typeof subject === 'object') {
    for (name in subject) {
      if (subject.hasOwnProperty(name)) {
        this.localComponents[name] = true;
        this.exposed[name] = subject[name];
      }
    }
  }

  return this;
}

/**
 * Callback invoked to handle calls to our side's methods
 *
 * @callback JRPC~serviceCallback
 *
 * @param {(Object|Array|null)}        params Parameters received
 * @param {JRPC~serviceResultCallback} next   Callback to send your result
 *
 * @return {undefined} No return value
 */

/**
 * Serve a request we received
 *
 * @param {Object} request Request to parse
 *
 * @return {undefined} No return value
 */
function serveRequest(request) {
  var id = null;
  var params = null;

  if (!this.active || typeof request !== 'object' || request === null) {
    return;
  }

  if (!(typeof request.jsonrpc === 'string' && request.jsonrpc === '2.0')) {
    return;
  }

  id = (typeof request.id !== 'undefined' ? request.id : null);
  if (typeof request.method !== 'string') {
    if (id !== null) {
      this.localTimers[id] = true;
      setImmediate(sendResponse.bind(this, id, -32600));
    }
    return;
  }

  if (!(request.method in this.exposed)) {
    if (id !== null) {
      this.localTimers[id] = true;
      setImmediate(sendResponse.bind(this, id, -32601));
    }
    return;
  }

  if ('params' in request) {
    if (typeof request['params'] === 'object') {
      params = request['params'];
    } else {
      if (id !== null) {
        this.localTimers[id] = true;
        setImmediate(sendResponse.bind(this, id, -32602));
      }
      return;
    }
  }

  if (id === null) {
    this.discardSerial--;
    id = this.discardSerial;  // Try to avoid collisions with remote end
  }
  if (this.localTimeout > 0) {
    this.localTimers[id] = setTimeout(
      sendResponse.bind(
        this,
        id,
        {
          code   : -1002,
          message: 'Method handler timed out'
        },
        undefined,
        true  // Hint that we're the timeout
      ),
      this.localTimeout
    );
  } else {
    this.localTimers[id] = true;
  }
  setImmediate(
    this.exposed[request.method],
    params,
    sendResponse.bind(this, id)  // id will be unknown, thus will be silent
  );

  return;
}

/**
 * Handle local method results
 *
 * @type {JRPC~serviceResultCallback}
 *
 * @param {number}  id        Serial number, bound, no need to supply
 * @param {boolean} err       Anything non-falsey means error and is sent
 * @param {Object}  result    Any result you wish to produce
 * @param {boolean} [timeout] We're invoked from the method timeout
 *
 * @return {undefined} No return value
 */
function sendResponse(id, err, result, timeout) {
  var response = {
    jsonrpc: '2.0',
    id     : id
  };

  if (this.active && id in this.localTimers) {
    if (timeout === true) {
      clearTimeout(this.localTimers[id]);
    }
    delete this.localTimers[id];
  } else {
    // Silently ignoring second response to same request
    return;
  }

  if (id === null || id < 0) {
    return;
  }

  if (typeof err !== 'undefined' && err !== null && err !== false) {
    if (typeof err === 'number') {
      response.error = {
        code   : err,
        message: 'error'
      };
    } else if (err === true) {
      response.error = {
        code   : -1,
        message: 'error'
      };
    } else if (typeof err === 'string') {
      response.error = {
        code   : -1,
        message: err
      };
    } else if (
      typeof err === 'object'
      && 'code' in err
      && 'message' in err
    ) {
      response.error = err;
    } else {
      response.error = {
        code   : -2,
        message: 'error',
        data   : err
      };
    }
  } else {
    response.result = result;
  }
  this.outbox.responses.push(response);

  // If we're interactive, send the new response
  this.transmit();
}


// Public methods

JRPC.prototype.shutdown = shutdown;
JRPC.prototype.call = call;
JRPC.prototype.notify = call;
JRPC.prototype.expose = expose;
JRPC.prototype.upgrade = upgrade;
JRPC.prototype.receive = receive;
JRPC.prototype.transmit = transmit;
JRPC.prototype.setTransmitter = setTransmitter;

// Support Bluebird automatically if it's globally available

if (typeof Promise.promisify === 'function') {
  JRPC.prototype.callAsync = Promise.promisify(call);
}

module.exports = JRPC;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"timers":3}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) { timeout.close(); };

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
  delete immediateIds[id];
};
},{"process/browser.js":2}]},{},[1])(1)
});