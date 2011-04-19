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

function Model() {
  throw Error('Use Model.get instead')  ;
}

(function() {

  var proxiesImplemented = !!this.Proxy;
  if (!proxiesImplemented) {
    console.warn(
        'Proxy are not available. Changes to models will not be observable.');
  }

  var wrappedToUnwrapped = new WeakMap;
  var wrappedToUnwrappedById = {};
  var unwrappedToWrapped = new WeakMap;
  var unwrappedToWrappedById = {};
  var observersMap = new WeakMap;

  function isObject(obj) {
    return obj === Object(obj);
  }

  function shouldWrap(obj) {
    return isObject(obj);
  }

  function isModel(model) {
    return getUnwrapped(model) !== undefined;
  }

  function getUnwrapped(wrapped) {
    return wrappedToUnwrappedById[wrapped.__id__] ||
           wrappedToUnwrapped.get(wrapped);
  }

  function getWrapped(unwrapped) {
    return unwrappedToWrappedById[unwrapped.__id__] ||
           unwrappedToWrapped.get(unwrapped);
  }

  /**
   * Returns an exisiting model for some data.
   * @param {*} data The data to find the model for.
   * @return {*} The model or undefined if no existing model exists yet.
   */
  function getExistingModel(data) {
    return isModel(data) ? data : getWrapped(data);
  }

  /**
   * Creates a proxy for a given object. We currently have different proxies for
   * functions and non functions. If opt_sortFunc and/or opt_filterFunc are
   * provided, then the proxy returned is a view onto the object.
   * @param {!Object} object Object to create a proxy for.
   * @param {function} opt_sortFunc The compare function to be used for a view.
   * @param {function} opt_filterFunc The filter function to be used for a view.
   * @param {Array} opt_paths The paths from each member of object
   *                          that opt_sortFunc and opt_filterFunc depend upon.
   * @return {Proxy} The proxy object.
   */
  function createProxyFor(object, opt_sortFunc, opt_filterFunc, opt_paths) {
    if (!proxiesImplemented)
      return object;

    if (Array.isArray(object)) {
      if (opt_sortFunc || opt_filterFunc) {
        handler = Object.create(arrayViewHandlerProto);
        object = handler.init(object, opt_sortFunc, opt_filterFunc, opt_paths);
      } else {
        handler = Object.create(arrayHandlerProto);
      }
    } else {
      handler = Object.create(handlerProto);
    }

    handler.object = object;

    var proxy;
    if (typeof object == 'function') {
      var callTrap = function() {
        var args = Array.prototype.map.call(arguments, function(arg) {
          return getUnwrapped(arg) || arg;
        });
        return Model.get(object.apply(this, args));
      };
      var constructTrap = function() {
        var obj = Object.create(proxy.prototype);
        var rv = object.apply(obj, arguments);
        if (isObject(rv))
          obj = rv;
        return Model.get(obj);
      };
      proxy = Proxy.createFunction(handler, callTrap, constructTrap);
    } else {
      proxy = Proxy.create(handler, Object.getPrototypeOf(object));
    }

    handler.proxy_ = proxy;

    if ('__id__' in object) {
      var id = object.__id__;
      unwrappedToWrappedById[id] = proxy;
      wrappedToUnwrappedById[id] = object;
    } else {
      unwrappedToWrapped.set(object, proxy);
      wrappedToUnwrapped.set(proxy, object);
    }
    return proxy;
  }

  /**
   * Calls |fun| on all items in |array| but ignores errors. After calling the
   * the function it will return the first exception.
   * @param {Array} array The array to iterate over.
   * @param {Function} fun The function to call for each item in the array.
   */
  function forEachCaptureThrow(array, fun) {
    var exception;
    for (var i = 0; i < array.length; i++) {
      try {
        fun(array[i]);
      } catch (ex) {
        if (!exception)
          exception = ex;
      }
    }
    return exception;
  }

  /**
   * @param {*} s The value to test.
   * @return {boolean} Whether a value is a considered an indexed property name.
   *     Indexes are uint32.
   */
  function isIndex(s) {
    // toUint32: s >>> 0
    return +s === s >>> 0;
  }

  function getObserverIndex(observers, callback) {
    for (var i = 0; i < observers.length; i++) {
      if (observers[i].callback === callback)
        return i;
    }
    return -1;
  }

  function createNewObserver(callback, internal) {
    return {callback: callback, internal: internal};
  }

  Model.get = function(data, path) {
    if (path) {
      path = new Path(path);
      if (path.length > 0) {
        var copy = data;
        data = undefined;
        path.walk(copy, function(m, i) {
          if (i == path.length) {
            data = m;
          }
        });
      }
    }

    if (!shouldWrap(data))
      return data;

    var proxy = getExistingModel(data);
    if (proxy)
      return proxy;

    return createProxyFor(data);
  };

  Model.getView = function(data, sortFunc, filterFunc, paths) {
    if (!sortFunc && !filterFunc)
      return Model.get(data);

    if (!shouldWrap(data))
      return data;

    if (isModel(data)) {
      data = wrappedToUnwrapped.get(data);
    }

    // TODO(rafaelw): Throw here?
    if (!Array.isArray(data))
      return data;

    return createProxyFor(data, sortFunc, filterFunc, paths)
  }

  var pathValueMap = new WeakMap;

  Model.observe = function(data, path, callback) {
    path = new Path(path);

    // Return an "anonymous root" PathValue which is not (and can not) be
    // observed, but whose value can be read and written
    // TODO(rafaelw): This is a bit unfortunate when data isn't a scalar.
    // it means that there may be more than one PathValue pointing at the
    // same root object. Perhaps its better to allow root pathValues to be
    // valid without observers, and if their value is set, the pathValueMap
    // is updated with the new key.
    if (path.length == 0)
      return new PathValue(data);

    // If the data is unobservable
    if (!shouldWrap(data))
      throw Error('Invalid path from unobservable data');

    var model = Model.get(data);

    var pathValue = pathValueMap.get(model);
    if (!pathValue) {
      pathValue = new PathValue(model);

      if (isModel(model))
        pathValueMap.set(model, pathValue);
    }

    for (var i = 0; i < path.length; i++) {
      pathValue = pathValue.getDescendant_(path.get(i));
    }

    pathValue.observe(callback);
    return pathValue;
  };

  function observeObjectInternal(data, callback, internal) {
    if (!shouldWrap(data))
      return;

    var model = Model.get(data);

    var observers = observersMap.get(model);
    if (!observers) {
      observers = [];
      observersMap.set(model, observers);
    }

    // Order of |observers| is significant. All internal observers
    // should fire before external observers.
    var index = getObserverIndex(observers, callback);
    if (index < 0)
      observers.push(createNewObserver(callback, internal));
  }

  Model.observeObject = function(data, callback) {
    observeObjectInternal(data, callback, false)
  };

  Model.stopObserving = function(data, path, callback) {
   if (!shouldWrap(data))
      return;

    // If there isn't an existing model no one has called Model.observe/get on
    // the data and therefore there is nothing to remove.
    var model = getExistingModel(data);
    if (!model)
      return;

    path = new Path(path);
    if (path.length == 0)
      return;

    var rootValue = pathValueMap.get(model);
    if (!rootValue)
      return;

    var pathValue = rootValue;
    for (var i = 0; i < path.length; i++) {
      var propertyName = path.get(i);
      if (!pathValue.hasDescendant_(propertyName))
        return;

      pathValue = pathValue.getDescendant_(propertyName);
    }

    pathValue.stopObserving(callback);
    if (!rootValue.hasObservers_) {
      pathValueMap['delete'](model);
    }
  };

  Model.stopObservingObject = function(data, callback) {
    if (!shouldWrap(data))
      return;

    // If there isn't an existing model no one has called Model.observe/get on
    // the data and therefore there is nothing to remove.
    var model = getExistingModel(data);
    if (!model)
      return;

    var observers = observersMap.get(model);
    if (!observers)
      return;

    var index = getObserverIndex(observers, callback);
    if (index < 0)
      return;

    observers.splice(index, 1);
  };

  function notifySplice(data, index, removed, added) {
    var change = {
      mutation: 'splice',
      index: index,
      added: added,
      removed: removed
    };

    notifyChange(data, change);
  }

  function notifyChange(data, change) {
    if (!shouldWrap(data))
      return;

    // If there isn't an existing model no one has called Model.observe/get on
    // the data and therefore there is nothing to notify.
    var model = getExistingModel(data);
    if (!model)
      return;

    var observers = observersMap.get(model);
    if (!observers)
      return;

    change.model = model;

    // Make sure all observers see a model of the data changed,
    // rather than the raw changes themselves.
    change = Model.get(change);

    // The notification cycle here is:
    // 1) Notify all internal (observer.internal == true) observers. These will
    //    be already sorted first in the observers array. Internal observers
    //    can return an array of observers that will be called in the next cyle.
    // 2) Notify all external observers.
    // 3) Continue notifying successive rounds of "post"-internal observers
    //    until none remain.
    // --
    // Functionaly, the notification order is:
    // 1) All PathValues get notified first, so they can push new values to all
    //    leaves so that when external observers get called, they see consistent
    //    values.
    // 2) Notify all observers registered with Model.observeObject.
    // 3) Notify all PathValue observers in breadth-first order.

    // Make sure internal observers get notified first.
    function reorderObservers(observers) {
      var start = 0;
      var end = observers.length - 1;
      while (start < end) {
        if (observers[start].internal) {
          start++;
          continue;
        }
        if (!observers[end].internal) {
          end--;
          continue;
        }
        var tmp = observers[start];
        observers[start] = observers[end];
        observers[end] = tmp;
        start++;
        end--;
      }
    }
    reorderObservers(observers);

    var observersRemaining = observers;
    var exception;
    while (observersRemaining.length) {
      // Clone to avoid removal during dispatch.
      var current = observersRemaining.concat();
      observersRemaining = [];

      var ex = forEachCaptureThrow(current, function(observer) {
        // An external observer may throw here, but an internal observer
        // should not.
        var internalResult = observer.callback(change);

        if (observer.internal && internalResult) {
          if (internalResult.observers && internalResult.observers.length) {
            observersRemaining =
                observersRemaining.concat(internalResult.observers);
          }
          if (internalResult.exception)
            throw internalResult.exception;
        }
      });
      if (!exception)
        exception = ex;
    }

    if (exception)
      throw exception;
  }

  Model.notify = function(data, propertyName, mutation, value, oldValue) {
    var change = {
      propertyName: propertyName,
      mutation: mutation,
      oldValue: oldValue,
      value: value
    }

    notifyChange(data, change);
  };

  var handlerProto = {
    __proto__: ForwardingHandler.prototype,

    'delete': function(name) {
      var hasOwnProp = this.object.hasOwnProperty(name);
      if (!hasOwnProp)
        return true;

      var oldValue = this.object[name];
      var retval = delete this.object[name];
      // name was not a configurable property.
      if (!retval)
        return retval;

      if (name in this.object) {
        // In a prototype
        var newValue = this.object[name];
        if (newValue !== oldValue)
          Model.notify(this.proxy_, name, 'update', newValue, oldValue);
      } else {
        Model.notify(this.proxy_, name, 'delete', undefined, oldValue);
      }

      return retval;
    },

    get: function(receiver, name) {
      // console.log('get ' + name);
      return Model.get(this.object[name]);
    },

    set: function(receiver, name, val) {
      // console.log('set ' + name);

      var descriptor = Object.getOwnPropertyDescriptor(this.object, name);
      // Cannot set read only property.
      if (descriptor && (!descriptor.writable && !descriptor.set))
        return false;

      var hasProp = name in this.object;
      var mutation = hasProp ? 'update' : 'add';
      var oldValue = this.object[name];

      if (hasProp && oldValue === val)
          return true;

      // We need to handle the case where the object does a manual notify.
      // TODO(arv): Can we get around to not doing this somehow?
      var fired = false;
      var model = this.proxy_;
      function handleSelfFire(change) {
        fired = change.model === model &&
            change.propertyName == name &&
            change.value === val &&
            change.oldValue === oldValue;
      }
      Model.observeObject(this.object, handleSelfFire);

      this.object[name] = val;

      Model.stopObservingObject(this.object, handleSelfFire);
      if (!fired)
        Model.notify(this.proxy_, name, mutation, val, oldValue);

      return true;
    }
  };

  /**
   * This object provides implementations of some of the Array methods so that
   * we only dispatch 'splice' changes instead of tons of more generic events.
   */
  var arrayModelImplementations = {
    splice: function(index, deleteCount, var_args) {
      var argc = arguments.length;
      if (argc < 2)
        return [];

      var length = this.length;
      if (index < 0)
        index = length + index;

      index = Math.max(0, Math.min(index, length));
      deleteCount = Math.max(0, Math.min(length, deleteCount));

      if (deleteCount == 0 && arguments.length <= 2)
        return [];

      var arr = getUnwrapped(this) || this;
      var removed = arr.slice(index, index + deleteCount);
      var added = Array.prototype.slice.call(arguments, 2);
      var rv = Array.prototype.splice.apply(arr, arguments);
      notifySplice(this, index, removed, added);
      return rv;
    },

    push: function(var_args) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(this.length, 0);
      this.splice.apply(this, args);
      return this.length;
    },

    pop: function() {
      if (this.length == 0)
        return undefined;
      return this.splice(this.length - 1, 1)[0];
    },

    shift: function() {
      if (this.length == 0)
        return undefined;
      return this.splice(0, 1)[0];
    },

    unshift: function(var_args) {
      var argc = arguments.length;
      var length = this.length;
      if (argc > 0) {
        var spliceArgs = Array.prototype.slice.call(arguments);
        spliceArgs.unshift(0, 0);
        this.splice.apply(this, spliceArgs);
      }

      return length + argc;
    }
  };

  var arrayHandlerProto = {
    __proto__: handlerProto,

    batchCount_: 0,

    get: function(receiver, name) {
      var value;
      // If we have a specialized array method implementation we should use
      // that.
      if (arrayModelImplementations.hasOwnProperty(name)) {
        var handler = this;
        value = function() {
          // During these methods we ignore mutations to the element since we
          // are managing these method side effects as an atomic 'splice'
          // notification.
          handler.batchCount_++;
          try {
            return arrayModelImplementations[name].apply(this, arguments);
          } finally {
            handler.batchCount_--;
          }
        };
      } else {
        value = this.object[name];
      }
      return Model.get(value);
    },

    set: function(receiver, name, val) {
      // TODO(arv): Handle read only?
      if (this.batchCount_) {
        this.object[name] = val;
        return true;
      }

      var length, index, removed, added;

      if (name == 'length') {
        length = this.object.length;
        if (val == length)
          return true;
        if (val < length) {
          index = val;
          removed = this.object.slice(val);
          added = [];

        } else if (val > length) {
          index = length;
          removed = [];
          added = Array(val - length);
        }

        this.object[name] = val;
        notifySplice(this.object, index, removed, added);
        return true;
      } else if (isIndex(name)) {
        length = this.object.length;
        index = +name;
        if (index >= length) {
          added = Array(index + 1 - length);
          added[added.length - 1] = val;
          removed = [];
        } else {
          var oldVal = this.object[name];
          added = [val];
          removed = [oldVal];
        }
        this.object[name] = val;
        notifySplice(this.object, index, removed, added);
        return true;
      }

      return handlerProto.set.apply(this, arguments);
    }
  };

  var arrayViewHandlerProto = {
    __proto__: arrayHandlerProto,

    init: function(tracked, sortFunc, filterFunc, paths) {
      this.tracked = tracked;
      this.trackedModel = Model.get(tracked);
      this.paths = paths || [];

      // TODO: Handle the case when there is only a sortFunc or only a
      // filterFunc
      this.sortFunc = sortFunc || function(a, b) {
        if (a === b)
          return 0;
        return a < b ? -1 : 1;
      }
      this.filterFunc = filterFunc || function(a) {
        return true;
      }

      this.addObservers_(this.tracked);

      var object = this.tracked.filter(this.filterFunc);
      if (this.sortFunc)
        object.sort(this.sortFunc);

      var self = this;
      Model.observeObject(this.trackedModel, function(e) {
        self.trackedDidSplice(e.removed, e.added);
      });

      return object;
    },

    searchPosition: function(sequence, item) {
      var startPos = 0;
      var endPos = sequence.length - 1;

      while( true ) {
        if (endPos == -1)
          return 0;
        if (startPos == sequence.length)
          return sequence.length;
        if (startPos > endPos)
          return index;

        var index = startPos + Math.round((endPos - startPos) / 2);

        if (index == sequence.length)
          return index;

        var current = sequence[index];
        if (current === item)
          return index;
        var sortVal = this.sortFunc(item, current);
        if (sortVal < 0) {
          endPos = index - 1;
        } else {
          index++;
          startPos = index;
        }
      }
    },

    trackedDidSplice: function(removed, added) {
      // TODO: This is weak: added and removed are proxy objects.
      // Because Array.isArray returns false for proxies of arrays,
      // concat (below) doesn't do the right thing. So we have
      // to unwrap the proxy in this case.
      if (isModel(removed))
        removed = wrappedToUnwrapped.get(removed);
      if (isModel(added))
        added = wrappedToUnwrapped.get(added);

      this.removeObservers_(removed);
      this.addObservers_(added);

      removed = removed.filter(this.filterFunc);
      added = added.filter(this.filterFunc);

      removed = removed.map(function(item) {
        return {
          item: item,
          removed: [item]
        }
      });
      added = added.map(function(item) {
        return {
          item: item,
          added: [item]
        };
      });

      var updates = added.concat(removed);

      // Deletes always come first
      updates.sort(function(a, b) {
        var sortVal = this.sortFunc(a.item, b.item);
        if (sortVal == 0 && a.removed)
          return -1;
        else if (sortVal == 0 && b.removed)
          return 1;
        else
          return sortVal;
      }.bind(this));

      var splice;
      var self = this;
      var objectModel = Model.get(self.object);
      var objectSplice = objectModel.splice;

      function newSplice() {
        var indexDelta = 0
        if (splice) {
          indexDelta += splice.added.length - splice.removed.length;
          var args = splice.added;
          args.unshift(splice.index, splice.removed.length);
          objectSplice.apply(objectModel, args);
          splice = undefined;
        }
        if (update) {
          delete update.item;
          splice = update;
          splice.index += indexDelta;
          splice.mutation = 'splice';
          splice.added = splice.added || [];
          splice.removed = splice.removed || [];
        }
      }

      for (var i = 0; i < updates.length; i++) {
        var update = updates[i];
        update.index = this.searchPosition(this.object, update.item);

        if (!splice) {
          newSplice();
        } else if (update.removed) {
          if (splice.index + splice.removed.length == update.index) {
            splice.removed.push(update.removed[0]);
          } else {
            newSplice();
          }
        } else {
          if (splice.index <= update.index &&
              update.index <= splice.index + splice.removed.length) {
            var splicePos = this.searchPosition(splice.added, update.added[0]);
            splice.added.splice(splicePos, 0, update.added[0]);
          } else {
            newSplice();
          }
        }
      }
      newSplice();
    },

    removeObservers_: function(removed) {
      var observers = this.observers_ || [];
      removed = removed.map(function(item) { return Model.get(item); });
      this.paths.forEach(function(path) {
        removed.forEach(function(obj) {
          for (var i = 0; i < observers.length; i++) {
            if (observers[i].model === objModel &&
                observers[i].path == path) {
              Model.stopObserving(obj, path, observers[i].callback);
              observers.splice(i, 1);
              break;
            }
          }
        });
      });
    },

    addObservers_: function(added) {
      function onObjectDependentPathChange(item) {
        var objectModel = Model.get(this.object);
        var index = this.object.indexOf(item);
        var numCopies = 1;
        if (index >= 0) {
          for (var i = index + 1;
               i < this.object.length && this.object[i] === item;
               ++i) {
            ++numCopies;
          }
          objectModel.splice(index, numCopies);
        }
        if (this.filterFunc(item)) {
          index = this.searchPosition(this.object, item);
          var args = [ index, 0 ];
          for (var i = 0; i < numCopies; ++i) {
            args.push(item);
          }
          objectModel.splice.apply(objectModel, args);
        }
      }

      var self = this;
      self.observers_ = self.observers_ || [];
      added.forEach(function(obj) {
        var cb = onObjectDependentPathChange.bind(self, obj);
        self.paths.forEach(function(path) {
          var objModel = Model.get(obj);
          Model.observe(objModel, path, cb);
          self.observers_.push({model: objModel, path: path, callback: cb});
        });
      });
    }
  }

  function checkIsValid(pathValue) {
    if (!pathValue.valid)
      throw Error('Unknown state: Observers must remain for value to be ' +
                  'valid.');
  }

  /**
   * PathValue is an (externally) immutable representation of a value from a
   * reference object to a Path. As long as observers are present on a PathValue
   * or any of its descendants (at deeper paths), its value is consistent.
   * All paths from the same reference object are structured as a tree,
   * with each deeper path represented as a set of descendants from the previous
   * depth level. Each PathValue is observing mutations to its reference object
   * (if it is current observable, i.e. an object), and when the propertyName of
   * its reference object changes value, it immediately propogates that change
   * to its descendants, then schedules notifications to fire (see notification
   * sequence above in comments of notifyChange()).
   * @param {*} root The value with is the reference of this PathValue.
   *     This will always either be a value, in which case this is the "root"
   *     value, or it will be a parent PathValue.
   * @return {string} propertyName If present, the property from the root that
   *     this PathValue represents. If absent, this PathValue is the root of an
   *     observation tree.
   */
  function PathValue(root, propertyName) {
    if (propertyName) {
      this.boundRefChanged_ = this.refChanged_.bind(this);
      this.boundNotify_ = this.notify_.bind(this);
      this.propertyName_ = propertyName;
      this.setRoot_(root); // Sets up the observer and initial value
    } else {
      // This PathValue is the root (holds onto the top-level model)
      this.value_ = root;
    }
  }

  PathValue.prototype = {
    get value() {
      checkIsValid(this);
      return this.value_;
    },

    set value(value) {
      checkIsValid(this);
      var ref = this.ref_;
      if (ref) {
        // Update the property value of the reference object.
        ref[this.propertyName_] = value;
      } else {
        // Directly update the value of the "root". This should not ever affect
        // listeners at deeper paths because PathValues retrieved with empty
        // paths are never used as parents of longer paths.
        this.value_ = value;
      }
    },

    /**
     * Allows an observer to query for its last observed value at this path.
     * @param {function} callback The registered callback for which the last
     *     observed value is requested
     * @return {*} The value as of callback registration or last notification
     */
    lastObservedValue: function(callback) {
      checkIsValid(this);
      var index = getObserverIndex(this.observers_, callback);
      if (index < 0)
        return;
      return this.observers_[index].lastObservedValue;
    },

    /**
     * Allows an observer to set the value of its lastObservedValue. This is
     * primarily useful immediately before setting the value via the value
     * property, so as to avoid being notified that the value changed.
     * @param {Function} callback The registered callback for which the last
     *     observed value is requested
     */
    expectValue: function(callback, value) {
      this.checkValid_;
      var index = getObserverIndex(this.observers_, callback);
      if (index < 0)
        return;
      this.observers_[index].lastObservedValue = value;
    },

    /**
     * A PathValue is valid when there is at least one observer registered at
     * this depth or deeper -- or if it is an "anonymous root" (i.e. retrieved
     * via Model.observe() and an empty path).
     * @return {boolean} valid Returns whether the |value| property of this
     *     PathValue is valid and can be read.
     */
    get valid() {
      return this.root_ === undefined || this.hasObservers_;
    },

    get ref_() {
      // The reference object will always be a PathValue except when it's the
      // root object.
      return this.root_ instanceof PathValue ? this.root_.value : this.root_;
    },

    setRoot_: function(root) {
      // Deregister observation of old reference.
      if (this.observing_) {
        Model.stopObservingObject(this.observing_, this.boundRefChanged_);
        this.observing_ = null;
      }
      this.root_ = root;
      var ref = this.ref_;

      if (isObject(ref)) {
        observeObjectInternal(ref, this.boundRefChanged_, true);
        this.observing_ = ref;
      }

      var newValue = Model.get(ref, this.propertyName_);

      this.valueMaybeChanged_(newValue);
    },

    valueMaybeChanged_: function(newValue) {
      if (this.value_ === newValue)
        return false;

      var oldValue = this.value_;
      var newValue = this.value_ = newValue;

      if (this.descendants_) {
        Object.keys(this.descendants_).forEach(function(propertyName) {
          this.descendants_[propertyName].setRoot_(this);
        }, this);
      }

      return true;
    },

    notify_: function() {
      // notify_ is always called as an observer from the notifyChange loop.
      // This behavior here is to notify all observers at this depth level, and
      // return a new set of observers for the next depth level to the calling
      // notifyChange loop.
      var retval = {};

      // Notify Listeners
      if (this.observers_) {
        var newValue = this.value;
        retval.exception = forEachCaptureThrow(this.observers_.concat(),
                                               function(observer) {
          var oldValue = observer.lastObservedValue;
          if (newValue !== oldValue) {
            observer.lastObservedValue = newValue;
            observer.callback(newValue, oldValue);
          }
        });
      }

      // Schedule descendants to notify
      if (this.descendants_) {
        retval.observers = [];
        var keys = Object.keys(this.descendants_);
        for (var i = 0; i < keys.length; i++) {
          var descendant = this.descendants_[keys[i]];
          var observer = createNewObserver(descendant.boundNotify_, true);
          retval.observers.push(observer);
        }
      }

      return retval;
    },

    refChanged_: function(change) {
      if (this.dead_)
        throw Error('refChanged_ callback received at dead PathValue');

      // refChanged_ is called as an observer (Model.observeObject) of this
      // PathValue's reference object (if any). The behavior is to update
      // value_, propagate all updates to descendants, then schedule a single
      // new observer to fire
      // notifications from this
      if (change.propertyName === this.propertyName_) {
        if (this.valueMaybeChanged_(change.value))
          return {observers: [createNewObserver(this.boundNotify_, true)]};
      }

      // Handle array notification
      if (change.mutation != 'splice' || !isIndex(this.propertyName_))
        return;

      var index = +this.propertyName_;
      if (change.index > index)
        return;

      if (index < (change.index + change.removed.length) ||
          change.removed.length != change.added.length) {
        if (this.valueMaybeChanged_(Model.get(this.ref_, this.propertyName_)))
          return {observers: [createNewObserver(this.boundNotify_, true)]};
      }
    },

    observe: function(callback) {
      // Nothing to be observed. This is either the root object or a PathValue
      // holding a scalar value.
      if (!this.root_)
        return;

      // This is tricky: We have to wait to call this.value until we have at
      // least one observer registered. Otherwise, this.value will throw
      // in inconsistency.
      var observer;
      this.observers_ = this.observers_ || [];
      var index = getObserverIndex(this.observers_, callback);
      if (index < 0) {
        observer = createNewObserver(callback);
        this.observers_.push(observer);
      } else {
        observer = this.observers_[index];
      }

      observer.lastObservedValue = this.value;
    },

    stopObserving: function(callback) {
      if (!this.observers_)
        return;

      var index = getObserverIndex(this.observers_, callback);
      if (index < 0)
        return;

      this.observers_.splice(index, 1);

      // PathValue becomes invalid when last observer is removed.
      if (this.observers_.length == 0) {
        delete this.observers_;
        this.maybeDestruct_();
      }
    },

    get hasObservers_() {
      return this.observers_ ||
             (this.descendants_ && Object.keys(this.descendants_).length);
    },

    maybeDestruct_: function() {
      // maybeDestruct_ is called every time an observer or descendant is
      // removed. If a PathValue has neither, then it is no longer valid and
      // must stop observation of its reference object, tear-down and remove
      // itself from its parent.
      if (this.hasObservers_)
        return;

      if (this.observing_) {
        Model.stopObservingObject(this.observing_, this.boundRefChanged_);
        this.observing_ = null;
      }

      // This path value doesn't have observers or descendants, remove it
      // from its parent, if it has one
      if (this.root_ instanceof PathValue) {
        this.root_.removeDescendant_(this.propertyName_);
      } else {
        // Make sure the main pathValueMap isn't holding onto a dead root
        // PathValue.
        pathValueMap['delete'](this.value_);
      }
      this.value_ = null;
      this.root_ = null;
      this.propertyName_ = null;
      this.descendants_ = null;
      this.dead_ = true;
    },

    hasDescendant_: function(propertyName) {
      return this.descendants_ && propertyName in this.descendants_;
    },

    getDescendant_: function(propertyName) {
      if (this.hasDescendant_(propertyName)) {
        return this.descendants_[propertyName];
      }

      // It's important that we create the key in this.descendants_
      // before initializing the new PathValue because the new PathValue
      // will attempt to access the |value| property of |this| and
      // we need to let it know that it has at least one descendant, so it
      // won't throw.
      this.descendants_ = this.descendants_ || {};
      this.descendants_[propertyName] = undefined;
      var pv = new PathValue(this, propertyName);
      this.descendants_[propertyName] = pv;
      return pv;
    },

    removeDescendant_: function(propertyName) {
      delete this.descendants_[propertyName];
      this.maybeDestruct_();
    }
  };
})();
