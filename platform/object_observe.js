// Copyright 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function() {
  var proxiesImplemented = !!this.Proxy;
  if (!proxiesImplemented)
    return;

  function isObject(obj) {
    return obj === Object(obj);
  }

  var wrappedToUnwrapped = new WeakMap;
  var unwrappedToWrapped = new WeakMap;
  var wrappedToHandler = new WeakMap;

  Object.isObservable = function(obj) {
    return getUnwrapped(obj) !== undefined;
  }

  function getUnwrapped(wrapped) {
    if (!isObject(wrapped))
      return undefined;

    return wrappedToUnwrapped.get(wrapped);
  }

  function getWrapped(unwrapped) {
    if (!isObject(unwrapped))
      return undefined;

    return unwrappedToWrapped.get(unwrapped);
  }

  function getHandler(wrapped) {
    if (!isObject(wrapped))
      return undefined;

    return wrappedToHandler.get(wrapped);
  }

  function getExistingObservable(data) {
    return Object.isObservable(data) ? data : getWrapped(data);
  }

  Object.getObservable = function(obj) {
    if (!isObject(obj))
      return obj;

    var proxy = getExistingObservable(obj);
    if (proxy)
      return proxy;

    return createProxyFor(obj);
  };

  function createProxyFor(object) {
    var handlerProto = Array.isArray(object) ?
        arrayHandlerProto : objectHandlerProto;
    var handler = Object.create(handlerProto);
    handler.object = object;

    var proxy;
    if (typeof object == 'function') {
      proxy = Proxy.createFunction(handler,
        function() {
          var args = Array.prototype.map.call(arguments, function(arg) {
             return getUnwrapped(arg) || arg;
           });
           return Object.getObservable(object.apply(getUnwrapped(this), args));
        },
        function() {
          var obj = Object.create(object.prototype);
          var rv = object.apply(obj, arguments);
          if (isObject(rv))
            obj = rv;
          return Object.getObservable(obj);
        }
      );
    } else {
      proxy = Proxy.create(handler, Object.getPrototypeOf(object));
    }

    handler.proxy = proxy;

    unwrappedToWrapped.set(object, proxy);
    wrappedToHandler.set(proxy, handler);
    wrappedToUnwrapped.set(proxy, object);

    return proxy;
  }

  Object.observe = function(observable, observer) {
    var handler = getHandler(observable);
    if (!handler) {
      throw new TypeError('Can not directly observe objects. ' +
                          'Use Object.getObservable');
    }

    if (!handler.observers) {
      handler.observers = [observer];
      return;
    }

    var index = handler.observers.indexOf(observer);
    if (index >= 0)
      return;

    handler.observers.push(observer);
  }

  Object.stopObserving = function(observable, observer) {
    var handler = getHandler(observable);
    if (!handler)
      return;

    if (!handler.observers)
      return;

    var index = handler.observers.indexOf(observer);
    if (index < 0)
      return;

    handler.observers.splice(index, 1);
  }

  var objectHandlerProto = createObject({
    __proto__: ForwardingHandler.prototype,

    logMutation: function(mutation) {
      mutation.target = this.proxy;
      // TODO(rafaelw): Deep freeze mutation to be safe?
      if (!this.observers)
        return;

      this.observers.forEach(function(observer) {
        enqueueMutation_(observer, mutation);
      });
    },

    'delete': function(name) {
      var retval = ForwardingHandler.prototype['delete'].call(this, name);
      this.logMutation({mutation: 'delete', name: name});
      return retval;
    },

    get: function(receiver, name) {
      var retval = ForwardingHandler.prototype.get.call(this, receiver, name);
      // TODO(rafaelw): Handle array operations.
      return Object.getObservable(retval);
    },

    set: function(receiver, name, val) {
      var retval = ForwardingHandler.prototype.set.call(this,
                                                        receiver,
                                                        name,
                                                        val);
      this.logMutation({mutation: 'set', name: name});
      return retval;
    }
  });

  /**
   * @param {*} s The value to test.
   * @return {boolean} Whether a value is a considered an indexed property name.
   *     Indexes are uint32.
   */
  function isIndex(s) {
    // toUint32: s >>> 0
    return +s === s >>> 0;
  }

  function newSpliceMutation(index, deleteCount, addCount) {
    return {
      mutation: 'splice',
      index: index,
      deleteCount: deleteCount,
      addCount: addCount
    }
  }

  var arrayMutationHandlers = {
    splice: function(index, deleteCount, var_args) {
      if (arguments.length < 1)
        return;

      var length = this.length;
      if (index < 0)
        index = length + index;

      index = Math.max(0, Math.min(index, length));
      if (deleteCount === undefined)
        deleteCount = length - index;
      deleteCount = Math.max(0, Math.min(length - index, deleteCount));

      if (deleteCount == 0 && arguments.length <= 2)
        return;

      return newSpliceMutation(index,
                               deleteCount,
                               Math.max(0, arguments.length - 2));  // addCount
    },

    push: function(var_args) {
      if (arguments.length > 0)
        return newSpliceMutation(this.length,  // index
                                 0,  // deleteCount
                                 arguments.length);  // addCount
    },

    pop: function() {
      if (this.length == 0)
        return;
      return newSpliceMutation(this.length - 1,  // index
                               1,  // deleteCount
                               0); // addCount
    },

    shift: function() {
      if (this.length == 0)
        return;
      return newSpliceMutation(0,  // index
                               1,  // deleteCount
                               0); // addCount
    },

    unshift: function(var_args) {
      if (arguments.length <= 0)
        return;
      return newSpliceMutation(0,  // index
                               0,  // deleteCount
                               arguments.length); // addCount
    }
  };

  var arrayIterators = {
    filter: true,
    forEach: true,
    every: true,
    map: true,
    some: true,
    reduce: true,
    reduceRight: true
  };

  var arrayHandlerProto = createObject({
    __proto__: objectHandlerProto,

    batchCount_: 0,

    logMutation: function(mutation) {
      if (this.batchCount_)
        return;
      objectHandlerProto.logMutation.apply(this, arguments);
    },

    get: function(receiver, name) {
      // Iterators need to "re-wrap" items when provided to the |callback|.
      // However, since iterators don't care much to be provided wet or dry
      // objects, we just use the default implementation and allow wet objects
      // to be passed in and thus back out via the callback.
      if (arrayIterators.hasOwnProperty(name)) {
        return Array.prototype[name];
      }

      // Array operations all log 'splice' mutations and mute the flow of
      // property set/gets during the operation.
      if (arrayMutationHandlers.hasOwnProperty(name)) {
        var handler = this;
        return Object.getObservable(function() {
          // During these methods we ignore mutations to the element since we
          // are managing these method side effects as an atomic 'splice'
          // notification.
          var mutation;
          try {
            mutation = arrayMutationHandlers[name].apply(this, arguments);
            if (mutation) {
              handler.batchCount_++;
              objectHandlerProto.logMutation.call(handler, mutation);
            }

            return handler.object[name].apply(this, arguments);
          } finally {
            if (mutation)
              handler.batchCount_--;
          }
        });
      }

      // Default behavior
      return objectHandlerProto.get.apply(this, arguments);
    },

    set: function(receiver, name, val) {
      var length, index, mutation;

      if (name == 'length') {
        length = this.object.length;
        if (val < length) {
          mutation = newSpliceMutation(val,  // index
                                       length - val,  // deleteCount
                                       0); // addCount
        } else if (val > length) {
          mutation = newSpliceMutation(length,  // index
                                       0,  // deleteCount
                                       val - length); // addCount
        }
      } else if (isIndex(name)) {
        length = this.object.length;
        index = +name;
        if (index >= length) {
          mutation = newSpliceMutation(length,  // index
                                       0,  // deleteCount
                                       index + 1 - length); // addCount
        }
      }

      try {
        if (mutation) {
          this.batchCount_++;
          objectHandlerProto.logMutation.call(this, mutation);
        }

        return objectHandlerProto.set.apply(this, arguments);
      } finally {
        if (mutation)
          this.batchCount_--;
      }
    }
  });
})();
