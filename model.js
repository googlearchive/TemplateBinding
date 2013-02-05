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

var Model = {};

(function(global) {

  function isObject(obj) {
    return obj === Object(obj);
  }

  // FIXME: Use Map/Set iterators when available.
  var HarmonyMap = global.Map ? global.Map : null;
  var HarmonySet = global.Set ? global.Set : null;

  function Map() {
    if (HarmonyMap)
      this.map_ = new HarmonyMap;
    else
      this.values_ = [];

    this.keys_ = [];
  }

  Map.prototype = {
    get: function(key) {
      return this.map_ ? this.map_.get(key) : this.values_[this.keys_.indexOf(key)];
    },

    set: function(key, value) {
      if (this.map_) {
        if (!this.map_.has(key))
          this.keys_.push(key);
        return this.map_.set(key, value);
      }

      var index = this.keys_.indexOf(key);
      if (index < 0)
        index = this.keys_.length;

      this.keys_[index] = key;
      this.values_[index] = value;
    },

    has: function(key) {
      return this.map_ ? this.map_.has(key) : this.keys_.indexOf(key) >= 0;
    },

    delete: function(key) {
      var index = this.keys_.indexOf(key);
      if (index < 0)
        return false;

      this.keys_.splice(index, 1);
      if (this.map_)
        this.map_.delete(key);
      else
        this.values_.splice(index, 1);

      return true;
    },

    keys: function() {
      return this.keys_.slice();
    }
  }

  function Set() {
    if (HarmonySet)
      this.set_ = new HarmonySet;

    this.keys_ = [];
  }

  Set.prototype = {
    add: function(key) {
      if ((this.set_ && this.set_.has(key)) || (!this.set_ && this.keys_.indexOf(key) >= 0))
        return;

      this.keys_.push(key);

      if (this.set_)
        this.set_.add(key);
    },

    has: function(key) {
      return this.set_ ? this.set_.has(key) : this.keys_.indexOf(key) >= 0;
    },

    delete: function(key) {
      var index = this.keys_.indexOf(key);
      if (index < 0)
        return false;

      this.keys_.splice(index, 1);
      if (this.set_)
        this.set_.delete(key);

      return true;
    },

    keys: function() {
      return this.keys_.slice();
    }
  }


  var observer = new ChangeSummary(function(summaries) {
    summaries.forEach(invokeCallbacks);
  });

  var queue = [];

  Model.enqueue = function enqueue(func) {
    queue.push(func);
  };

  var notificationQueueIsRunning = false;

  Model.notifyChanges = function() {
    // Prevent reentrancy.
    if (notificationQueueIsRunning)
      return;
    notificationQueueIsRunning = true;

    observer.deliver();

    while (queue.length > 0) {
      var f = queue.shift();
      f();
    }

    notificationQueueIsRunning = false;
  };

  var callbacksMap = new Map;

  function invokeCallbacks(summary) {
    var callbacks = callbacksMap.get(summary.object);
    if (!callbacks)
      return;

    if (callbacks.array) {
      if (!summary.splices)
        return;
      callbacks.array.keys().forEach(function(callback) {
        try {
          callback(summary.splices, summary.object);
        } catch (ex) {
          console.log('Exception thrown during callback: ' + ex);
        }
      });
    }

    if (callbacks.path) {
      if (!summary.pathChanged)
        return;

      Object.keys(callbacks.path).forEach(function(path) {
        if (!summary.pathChanged.hasOwnProperty(path))
          return;

        callbacks.path[path].keys().forEach(function(callback) {
          try {
            callback(summary.pathChanged[path], summary.getOldValue(path), summary.object, path);
          } catch (ex) {
            console.log('Exception thrown during callback: ' + ex);
          }
        });
      });
    }
  }

  /**
   * Observes splices on |array|.
   * @param {Object} array The reference object.
   * @param {Function} callback Function to be called when a property is added
   *     or deleted from |data|.
   */
  Model.observeArray = function(array, callback) {
    if (!Array.isArray(array))
      throw Error('Invalid attempt to observe non-array: ' + arr);

    var callbacks = callbacksMap.get(array)
    if (!callbacks) {
      callbacks = {};
      callbacksMap.set(array, callbacks);
    }
    if (!callbacks.array) {
      callbacks.array = new Set;
      observer.observeArray(array);
    }

    callbacks.array.add(callback);
  };

  /**
   * Stops observation of adds/deletes on |data|.
   * @param {Object} data The reference object.
   * @param {Function} callback Function previously registered with |data| via
   *     Model.observeArray().
   */
  Model.unobserveArray = function(array, callback) {
    if (!Array.isArray(array))
      return;

    var callbacks = callbacksMap.get(array)
    if (!callbacks || !callbacks.array)
      return;

    callbacks.array.delete(callback)

    if (!callbacks.array.keys().length) {
      observe.unobserveArray(array);
      callbacks.array = undefined;
    }

    if (!callbacks.array && !callbacks.path)
      callbacksMap.delete(array);
  };

  /**
   * Observes the value at a path from an object. |callback| is invoked
   * IFF the value changes.
   * @param {Object} data The reference object.
   * @param {Path} path The path from the reference object to monitor a value.
   * @param {Function} callback Function to be called when the value changes.
   * @return {*} The current value of the observed path from the object.
   */
  Model.observePath = function(object, path, callback) {
    if (!ChangeSummary.isPathValid(path))
      return undefined;

    if (path.trim() == '')
      return object;

    if (!isObject(object))
      return undefined;

    var callbacks = callbacksMap.get(object)
    if (!callbacks) {
      callbacks = {};
      callbacksMap.set(object, callbacks);
    }

    if (!callbacks.path)
      callbacks.path = {};

    var pathCallbacks = callbacks.path[path];
    var retval;
    if (!pathCallbacks) {
      pathCallbacks = new Set;
      callbacks.path[path] = pathCallbacks;
      retval = observer.observePath(object, path);
    } else {
      retval = Model.getValueAtPath(object, path);
    }

    pathCallbacks.add(callback);
    return retval;
  };

  /**
   * Stops observation of changes to the value at a path from an object.
   * @param {Object} data The reference object.
   * @param {Path} path The path from the reference object to monitor a value.
   * @param {Function} callback Function previously registered with |data|  and
   *     |path| via Model.observePath().
   */
  Model.unobservePath = function(object, path, callback) {
    if (!ChangeSummary.isPathValid(path) || !isObject(object))
      return;

    var callbacks = callbacksMap.get(object)
    if (!callbacks || !callbacks.path)
      return;

    var pathCallbacks = callbacks.path[path];
    if (!pathCallbacks)
      return;

    pathCallbacks.delete(callback);


    if (!pathCallbacks.keys().length) {
      observer.unobservePath(object, path);
      delete callbacks.path[path];
    }

    if (!Object.keys(callbacks.path).length)
      callbacks.path = undefined;

    if (!callbacks.array && !callbacks.path)
      callbacksMap.delete(object);
  };

  Model.isPathValid = ChangeSummary.isPathValid;

  Model.getValueAtPath = ChangeSummary.getValueAtPath;

  Model.setValueAtPath = ChangeSummary.setValueAtPath;

})(this);
