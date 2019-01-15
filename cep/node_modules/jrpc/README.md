# jrpc v3.1.2

[![Build Status](https://travis-ci.org/vphantom/js-jrpc.svg?branch=v3.1.2)](https://travis-ci.org/vphantom/js-jrpc) [![Coverage Status](https://coveralls.io/repos/github/vphantom/js-jrpc/badge.svg?branch=v3.1.2)](https://coveralls.io/github/vphantom/js-jrpc?branch=v3.1.2)

Streaming bidirectional backwards-compatible extended JSON-RPC 2.0 in JavaScript

This rewrite is a full implementation of [JSON-RPC 2.0](http://www.jsonrpc.org/specification) which it extends in useful ways:

- Neither side is a "client" nor a "server" and can emit requests/notifications at any time.
- In line with [XML-RPC's introspection methods](http://scripts.incutio.com/xmlrpc/introspection.html) , the "system" root level name is reserved, which does not interfere with JSON-RPC's "rpc" reservation.
- Backwards-compatible upgrade to extended bimodal message format if both ends support it.

The only true deviation from JSON-RPC 2.0 is that, due to the async and typically real-time nature of this implementation, responses to batch requests may not necessarily be batched in matching groups.  i.e. If requests [1, 2, 3] were received, it's entirely possible that responses [1, 3] and a later response 2 may be emitted.  In practice, in a streaming communication, this wouldn't differ much because the only batches that would occur at all would be when resuming from a network interruption.

## Installation & Usage

### Client-side, stand-alone using Bower

```shell
bower install jrpc --save
```

You can then integrate `bower_components/jrpc/jrpc.min.js` to your build as needed.  (The non-minified version is a CommonJS module, not suitable for direct browser use.)  This was generated using `browserify --standalone` and is thus safe as-is or with various module systems.  Stand-alone example:

```html
<script src="jrpc.min.js"></script>
...
<script type="text/javascript"><!--
  var remote = new JRPC({ client: true });
  ...
// --></script>
```

#### Example with browsers' WebSocket

```js
// Expose what the other end can call
remote.expose({
  ping: function(params, next) {
    return next(false, 'pong');
  })
}
remote.upgrade();  // Handshake extended capabilities

// Create a WebSocket connection
var ws = new WebSocket(someURL);

// Hand off whatever WebSocket receives to JRPC
ws.onmessage = function(ev) {
  remote.receive(ev.data);
};

// Queue call the other end's 'foo.bar' method
remote.call('foo.bar', [], function(err, result) {
  if (err) {
    console.log('Something went wring in foo.bar()!');
  } else {
    console.log('foo.bar() returned: ' + result);
  }
});

// Send queued messages a single time
remote.transmit(function(msg, next) {
	try {
	  ws.send(msg);
	  return next(false);
	} catch (e) {
	  return next(true);
	}
});
```

Note that I personally use my small [LongWebSocket](https://www.npmjs.com/package/longwebsocket) wrapper client-side to make sure connections stay alive.


### Node.JS and client-side (CommonJS)

```shell
npm install jrpc --save
```

In Node.JS or if you're using Browserify to bundle CommonJS modules together for client-side use:

```js
var JRPC = require('jrpc');
var remote = new JRPC({ client: true });
...
```

#### Node.JS server with WebSocketServer

On the server side, instead of the global object `WebSocket` you could use the WebSocketServer implementation, and usage stays otherwise the same:

```js
var WebSocketServer = require('ws').Server;
var JRPC = require('jrpc');
var wss = new WebSocketServer(...);

wss.on('connection', function(ws) {
  // Each new connection gets a unique handler
  var remote = new JRPC();

  remote.expose(...);
  remote.upgrade();  // Handshake extended capabilities

  ws.on('message', function(msg) {
    remote.receive(msg);
  });

  // Let JRPC send requests and responses continuously
  remote.setTransmitter(function(msg, next) {
    try {
      ws.send(msg);
      return next(false);
    } catch (e) {
      return next(true);
    }
  });
});
```

### Socket.IO

On client and server sides, Socket.IO provides stability, protocol abstraction and channels.  One could perhaps even create multiple JRPC instances to assign to different channels.  The data exchange is otherwise identical to the above WebSocket examples: hand off received messages to `remote.receive()` and relay packets to the communications channel with `remote.setTransmitter()`.

### Node.JS parent-child IPC

One could use `process.send()` and `process.on('message')` with JSON-RPC as a multiplexer.

## API

All methods return the current instance to facilitate chaining if desired.  For example:

```js
remote
  .call('some.method', someCallback)
  .call('other.method', otherCallback)
  .transmit(outputFunction)
;
```

### remote = new JRPC([*options*])

JRPC allows the creation of multiple completely independent instances.  Available options:

#### remoteTimeout

(Default: 60 seconds.)  When `remote.call()` queues a call for the remote end, a timer is started for this delay.  If a response wasn't received and processed by then, the queued call's return callback is invoked with an error condition and the call is flushed from the queue.  If a response eventually arrives after this time, it will be silently discarded.  This helps ensure that the callback for each call is always invoked, and that the queue doesn't grow indefinitely during network outages.

Deactivate by setting explicitly to zero.  **CAUTION:** Without a timeout in place, your callback is no longer guaranteed to run in the event of protocol or network errors.

If you expect to deal with network latency, XmlHttpRequest long-poll related delays or network outages, you might want to increase this to 60-120 seconds.

#### localTimeout

(Default: 0, meaning inactive)  When `remote.receive()` launches exposed methods requested in the JSON-RPC request packet it received, a timer is started for this delay.  If the response callback hasn't fired by then, an error response is sent back and the call is flushed from the queue.  If the response callback does fire later, it will be silently discarded.  This helps ensure that servers always respond explicitly to calls, at the expense of possibly ignoring valid long-running responses.

If you expect to deal with computationally-intensive methods, you might want to increase this as appropriate.  Make sure, however, that the other end will wait even longer to allow for network latency and outages on top of this execution response time.

### remote.shutdown()

Frees as many resources as possible, cancels any outstanding timeouts and marks `remote` as no longer usable.  If you're permanently done with the JRPC instance, this can help performance and garbage collection a bit.

### remote.expose(*methodName*, *callback*)

Individually declare that `callback` is implementing `methodName`. Whenever calls from the other end will be processed, `callback` will be invoked and is expected to call JRPC's next callback with Node standard `(err, result)` arguments:

```js
remote.expose('foo.bar', function(params, next) {
  return next(false, 'This is my result string');
});
```

Due to the nature of JSON-RPC, even methods intended to be used as notification receivers need to call `next()` with at least one parameter, so that if the method is accidentally called requesting a value, one will reach the caller.  A simple `next(true)` suffices.

### remote.expose(*object*)

Add many declarations at once:

```js
remote.expose({
  'foo.bar': function(params, next) { ... },
  'ping': function(params, next) { ... }
});
```

Note that since periods '.' are part of property names, you'll need to use strings as keys throughout.

### remote.upgrade()

After having exposed your methods, if you are the origin of the network connection and you know that the other end may offer extensions beyond JSON-RPC 2.0 (i.e. this here implementation), call this method to have both ends handshake capabilities.  It is completely backwards-compatible, as a strict JSON-RPC 2.0 end point will simply respond that method `system.listComponents` doesn't exist.

While this implementation of JSON-RPC is client/server agnostic once a connection is established, since only one end needs to initiate a protocol upgrade it makes sense to do so on the client side.

If you are using JRPC on the client side and know in advance that the remote server is **not** JRPC, feel free to skip this step.

Note that it is important to handshake _after_ having exposed your service methods, because afterwards the other end will be limited to calling method names which have been already exposed at this point.  (See `remote.call()` below.)

### remote.call(*methodName*[, *params*][, *callback*]])

##### Bluebird: remote.callAsync(*methodName*, *params*)

Queue a call to the other end's method `methodName` with `params` as a single argument.  If you supplied a callback, it is _guaranteed_ to be invoked even if the server never responds, in which case it would be in error, after a timeout.  Note that omitting a callback implies that you're calling a remote method which returns no value (called "notifications" in JSON-RPC 2.0).

Note that after a successful `remote.upgrade()`, any attempts to call a `methodName` not disclosed by the remote end during capability handshake will immediately fail.  This is to save on useless network round-trips.

While it is up to implementations to decide what to do with `params`: either an Array or an object (alas, no bare values per the specification).  Specifying `null` is equivalent to omitting it entirely.  I recommend an object so that properties can be named and future changes have less risk of breaking anything.

```js
remote.call('foo', {}, function(err, result) {
  if (err) {
    // Something went wrong...
  } else {
    // 'result' was returned by the other end's exposed 'foo()'
  }
});
```

Per JSON-RPC 2.0 if an error is returned, not only is it not `null` nor `false` but it is necessarily an object with the following properties:

- **code** is a number, typically negative
- **message** is a string, not always useful however
- **data** is optional and may be any kind of additional data about the error

If you are using [Bluebird](https://github.com/petkaantonov/bluebird) globally, the promise version `remote.callAsync()` is also available:

```js
global.Promise = require('bluebird');
var JRPC = require('jrpc');
var remote = new JRPC();
...
var fooResult = yield remote.callAsync('foo', {});
```

It is **strongly recommended** to keep a non-zero remoteTimeout when using co-routines!

### remote.notify(*methodName*[, *params*])

Convenience shortcut to `remote.call()` so that your code can more clearly distinguish between method calls expecting a return value and one-way notifications.  By convention, it should never be invoked with a third `callback` argument.

### remote.receive(*message*)

Parse `message` as a JSON-RPC 2.0 request or response.  If it's a request, responses will be created and transmitted back (or queued).  If it's a response, callers will receive what they were waiting for.

### remote.transmit(*callback*)

If there is any queued up JSON-RPC to send to the other end, `callback(data,cb)` will be called to send it.  It will **not** be called if nothing is pending.  Your callback should call us back with `null` or `false` on success, `true` on error per Node convention.  (See examples in previous section.)

### remote.setTransmitter(*callback*)

Normally, JRPC doesn't know how to send data to the other end.  If you're using a polling communication model, you're probably invoking `remote.transmit()` periodically.  If you're on a fast I/O channel like WebSockets or Socket.IO, however, with this method you can tell JRPC to send messages as needed.

To stop this later, `remote.setTransmitter(null)` does the trick.

## RPC API

The `system` reserved module implements some handy introspection methods to help API users discover a server's exposed functionality.

### system.extension.dual-batch()

Returns true.  Its presence indicates support for the "dual-batch" extension to JSON-RPC 2.0 which was created for this module.  It means that this end can understand messages made up of _two_ JSON-RPC 2.0 messages combined: a batch of responses and a batch of requests.  This is very useful in saving precious round trips in long-polling scenarios where both ends may send requests or notifications.  The format is simple:

```json
{
  "responses": [],
  "requests": []
}
```

### system.listComponents([*mine*])

Like in XML-RPC, returns an object describing all exposed methods at the time it is called.  Each method name (including periods '.' treated as _regular_ characters) holds `true`.  Thus, in a fresh instance, it would return:

```json
{
  "system.listComponents": true,
  "system.extension.dual-batch": true
}
```

If provided, `mine` is expected to be the equivalent list from this end.  This allows for both ends to discover each other's capabilities in a single round-trip, by convention initiated by the end which established the communication, via `remote.upgrade()`.

### system.methodHelp(*methodName*)
### system.methodSignature(*methodName*)

Reserved per XML-RPC, but not implemented.

## MIT License

Copyright (c) 2016 Stephane Lavergne <https://github.com/vphantom>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
