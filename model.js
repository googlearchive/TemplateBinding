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

  var objectTrackerMap = new WeakMap;

  function isObject(obj) {
    return obj === Object(obj);
  }

  var mutationLog = new MutationLog;

  AspectWorkQueue.register(mutationLog, projectMutations);

  /**
   * @param {*} s The value to test.
   * @return {boolean} Whether a value is a considered an indexed property name.
   *     Indexes are uint32.
   */
  function isIndex(s) {
    // toUint32: s >>> 0
    return +s === s >>> 0;
  }

  function projectMutations() {
    var dirtyObjectsSet = new WeakMap;
    var trackers = [];

    mutationLog.clear().forEach(function(mutation) {
      var target = mutation.target;
      var tracker = objectTrackerMap.get(target);
      if (tracker) {
        tracker.addMutation(mutation);
        if (!dirtyObjectsSet.has(target)) {
          dirtyObjectsSet.set(target, true);
          addPendingCallback(tracker.dirtyCheck.bind(tracker));
        }
      }
    });

    runCallbackQueue();
  }

  var callbackQueue = [];

  function addPendingCallback(callback) {
    callbackQueue.push(callback);
  };

  var callbackQueueIsRunning = false;

  function runCallbackQueue() {
    if (callbackQueueIsRunning)
      return;
    callbackQueueIsRunning = true;

    var exception;
    for (var i = 0; i < callbackQueue.length; i++) {
      var callback = callbackQueue[i];
      try {
        callback();
      } catch (ex) {
        if (!exception)
          exception = ex;
      }
    }

    callbackQueue = [];
    callbackQueueIsRunning = false;

    if (exception)
      throw exception;
  };

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

    if (!isObject(data))
      return data;

    return Object.getObservable(data);
  };

  var pathValueMap = new WeakMap;

  /**
   * Observes the value at a path from an object. |callback| is invoked
   * IFF the value changes.
   * @param {object} data The reference object.
   * @param {Path} path The path from the reference object to monitor a value.
   * @return {*} The current value of the observed path from the object.
   */
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
    if (!isObject(data))
      throw Error('Invalid path from unobservable data');

    var model = Model.get(data);

    var pathValue = pathValueMap.get(model);
    if (!pathValue) {
      pathValue = new PathValue(model);

      if (isObject(model))
        pathValueMap.set(model, pathValue);
    }

    for (var i = 0; i < path.length; i++) {
      pathValue = pathValue.getDescendant_(path.get(i));
    }

    pathValue.observe(callback);
    return pathValue.value;
  };

  function getModelTracker(data) {
    var model = Object.getObservable(data);
    var tracker = objectTrackerMap.get(model);
    if (!tracker) {
      var tracker = createTracker(model);
      objectTrackerMap.set(model, tracker);
      Object.observe(model, mutationLog);
    }

    return tracker;
  }

  function observePropertyValue(data, name, callback) {
    if (!isObject(data))
      return;

    getModelTracker(data).addValueObserver(name, callback);
  }

  Model.observePropertySet = function(data, callback) {
    if (!isObject(data))
      return;

    getModelTracker(data).addPropertySetObserver(callback);
  };

  Model.stopObserving = function(data, path, callback) {
   if (!isObject(data))
      return;

    var model = Object.getObservable(data);

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
    if (!rootValue.hasObservers) {
      pathValueMap['delete'](model);
    }
  };

  function stopObservingPropertyValue(data, name, callback) {
    if (!isObject(data))
      return;

    var model = Object.getObservable(data);

    var tracker = objectTrackerMap.get(model);
    if (!tracker)
      return;

    tracker.removeValueObserver(name, callback);
    if (!tracker.observerCount) {
      objectTrackerMap.delete(model);
      Object.stopObserving(model, mutationLog);
    }
  }

  Model.stopObservingPropertySet = function(data, callback) {
    if (!isObject(data))
      return;

    var model = Object.getObservable(data);

    var tracker = objectTrackerMap.get(model);
    if (!tracker)
      return;

    tracker.removePropertySetObserver(callback);
    if (!tracker.observerCount) {
      objectTrackerMap.delete(model);
      Object.stopObserving(model, mutationLog);
    }
  };

  /**
   * PathValue is an representation of a value from a reference object to a
   * Path. As long as observers are present on a PathValue or any of its
   * descendants (at deeper paths), its value is consistent. All paths from the
   * same reference object are structured as a tree, with each deeper path
   * represented as a set of descendants from the previous depth level. Each
   * PathValue is observing mutations to its reference object (if it is current
   * observable, i.e. an object), and when the propertyName of its reference
   * object changes value, it immediately propogates that change to its
   * descendants, then schedules notifications to fire.
   * @param {*} root The value with is the reference of this PathValue.
   *     This will always either be a value, in which case this is the "root"
   *     value, or it will be a parent PathValue.
   * @return {string} propertyName If present, the property from the root that
   *     this PathValue represents. If absent, this PathValue is the root of an
   *     observation tree.
   */
  function PathValue(root, propertyName) {
    if (propertyName) {
      this.boundRefChanged = this.refChanged.bind(this);
      this.boundNotify = this.notify.bind(this);
      this.propertyName = propertyName;
      this.setRoot(root); // Sets up the observer and initial value
    } else {
      // This PathValue is the root (holds onto the top-level model)
      this.value = root;
    }
  }

  PathValue.prototype = {
    get ref() {
      // The reference object will always be a PathValue except when it's the
      // root object.
      return this.root instanceof PathValue ? this.root.value : this.root;
    },

    setRoot: function(root) {
      // Deregister observation of old reference.
      if (this.observing) {
        stopObservingPropertyValue(this.observing,
                                   this.propertyName,
                                   this.boundRefChanged);
        this.observing = undefined;
      }
      this.root = root;
      var ref = this.ref;

      if (isObject(ref)) {
        this.observing = ref;
        observePropertyValue(this.observing,
                             this.propertyName,
                             this.boundRefChanged);
      }

      this.valueMaybeChanged(Model.get(ref, this.propertyName));
    },

    valueMaybeChanged: function(newValue) {
      if (this.value === newValue)
        return false;

      var oldValue = this.value;
      this.value = newValue;

      if (this.descendants) {
        Object.keys(this.descendants).forEach(function(propertyName) {
          this.descendants[propertyName].setRoot(this);
        }, this);
      }

      return true;
    },

    notify: function() {
      var exception;
      if (this.observers && this.value !== this.lastValue) {
        var oldValue = this.lastValue;
        var newValue = this.lastValue = this.value;

        this.observers.concat().forEach(function(callback) {
          try {
            callback(newValue, oldValue);
          } catch (ex) {
            if (!exception)
              exception = ex;
          }
        });
      }

      // Schedule descendants to notify
      if (this.descendants) {
        var keys = Object.keys(this.descendants);
        for (var i = 0; i < keys.length; i++) {
          var descendant = this.descendants[keys[i]];
          addPendingCallback(descendant.boundNotify);
        }
      }

      if (exception)
        throw exception;
    },

    refChanged: function(change) {
      if (this.dead) {
        throw Error('refChanged callback received at dead PathValue');
      }
      // refChanged is called as an observer (Model.observePropertySet) of this
      // PathValue's reference object (if any). The behavior is to update
      // value_, propagate all updates to descendants, then schedule a single
      // new observer to fire
      // notifications from this
      if (this.valueMaybeChanged(change.value))
        addPendingCallback(this.boundNotify);
    },

    observe: function(callback) {
      // Nothing to be observed. This is either the root object or a PathValue
      // holding a scalar value.
      if (!this.root)
        return;

      if (!this.observers) {
        this.observers = [callback];
        this.lastValue = this.value
        return;
      }

      var index = this.observers.indexOf(callback);
      if (index >= 0)
        return;

      this.observers.push(callback);
    },

    stopObserving: function(callback) {
      if (!this.observers)
        return;

      var index = this.observers.indexOf(callback);
      if (index < 0)
        return;

      this.observers.splice(index, 1);

      // PathValue becomes invalid when last observer is removed.
      if (this.observers.length == 0) {
        this.observers = undefined;
        this.lastValue = undefined;
        this.maybeDestruct();
      }
    },

    get hasObservers() {
      return this.observers ||
             (this.descendants && Object.keys(this.descendants).length);
    },

    maybeDestruct: function() {
      // maybeDestruct is called every time an observer or descendant is
      // removed. If a PathValue has neither, then it is no longer valid and
      // must stop observation of its reference object, tear-down and remove
      // itself from its parent.
      if (this.hasObservers)
        return;

      if (this.observing) {
        stopObservingPropertyValue(this.observing,
                                   this.propertyName,
                                   this.boundRefChanged);
        this.observing = null;
      }

      // This path value doesn't have observers or descendants, remove it
      // from its parent, if it has one
      if (this.root instanceof PathValue) {
        this.root.removeDescendant_(this.propertyName);
      } else {
        // Make sure the main pathValueMap isn't holding onto a dead root
        // PathValue.
        pathValueMap['delete'](this.value);
      }
      this.value = null;
      this.root = null;
      this.propertyName = null;
      this.descendants = null;
      this.dead = true;
    },

    hasDescendant_: function(propertyName) {
      return this.descendants && propertyName in this.descendants;
    },

    getDescendant_: function(propertyName) {
      if (this.hasDescendant_(propertyName)) {
        return this.descendants[propertyName];
      }

      // It's important that we create the key in this.descendants
      // before initializing the new PathValue because the new PathValue
      // will attempt to access the |value| property of |this| and
      // we need to let it know that it has at least one descendant, so it
      // won't throw.
      this.descendants = this.descendants || {};
      this.descendants[propertyName] = undefined;
      var pv = new PathValue(this, propertyName);
      this.descendants[propertyName] = pv;
      return pv;
    },

    removeDescendant_: function(propertyName) {
      delete this.descendants[propertyName];
      this.maybeDestruct();
    }
  };

  function newSpliceMutation(index, deleteCount, addCount, target) {
    return {
      mutation: 'splice',
      index: index,
      deleteCount: deleteCount,
      addCount: addCount,
      target: target
    }
  }

  function intersect(start1, end1, start2, end2) {
    if (start1 > end1 || start2 > end2)
      throw Error('Invalid splice range provided: ' +
                  [start1, end1, start2, end2].join(', '));

    // Disjoint
    if (end1 < start2 || end2 < start1)
      return -1;

    // Adjacent
    if (end1 == start2 || end2 == start1)
      return 0;

    // Non-zero intersect, span1 first
    if (start1 < start2) {
      if (end1 < end2)
        return end1 - start2; // Overlap
      else
        return end2 - start2; // Contained
    } else {
      // Non-zero intersect, span2 first
      if (end2 < end1)
        return end2 - start1; // Overlap
      else
        return end1 - start1; // Contained
    }
  }

  function createPropertySet(obj) {
    var set = {};
    for (var prop in obj) {
      set[prop] = true;
    }
    return set;
  }

  function ObjectTracker(model) {
    this.target = model;
  }

  ObjectTracker.prototype = {
    observerCount: 0,
    addMutation: function(mutation) {}, // noop for object

    addPropertySetObserver: function(observer) {
      if (!this.propertySetObservers) {
        this.propertySetObservers = [];
        this.lastPropertySet = createPropertySet(this.target);
      }
      var index = this.propertySetObservers.indexOf(observer);
      if (index < 0) {
        this.propertySetObservers.push(observer);
        this.observerCount++;
      }
    },

    removePropertySetObserver: function(observer) {
      if (!this.propertySetObservers)
        return;

      var index = this.propertySetObservers.indexOf(observer);
      if (index < 0)
        return;

      this.propertySetObservers.splice(index, 1);
      this.observerCount--;
      if (this.propertySetObservers.length == 0) {
        this.propertySetObservers = undefined;
        this.lastPropertySet = undefined;
      }
    },

    addValueObserver: function(name, observer) {
      if (!this.valueObservers) {
        this.valueObservers = {};
        this.lastValues = {};
      }

      var observers = this.valueObservers[name];
      if (!observers) {
        observers = [];
        this.valueObservers[name] = observers;
        this.lastValues[name] = this.target[name];
      }

      var index = observers.indexOf(observer);
      if (index < 0) {
        observers.push(observer);
        this.observerCount++;
      }
    },

    removeValueObserver: function(name, observer) {
      if (!this.valueObservers)
        return;

      var observers = this.valueObservers[name];
      if (!observers)
        return;

      var index = observers.indexOf(observer);
      if (index < 0)
        return;

      observers.splice(index, 1);
      this.observerCount--;
      if (observers.length == 0) {
        this.valueObservers[name] = undefined;
        delete this.lastValues[name];
        if (Object.keys(this.lastValues).length == 0) {
          this.valueObservers = undefined;
          this.lastValues = undefined;
        }
      }
    },

    dirtyCheck: function() {
      this.notifyValueObservers();

      if (this.lastPropertySet) {
        var currentSet = createPropertySet(this.target);
        for (var prop in this.lastPropertySet) {
          if (!(prop in currentSet))
            this.notifyPropertySetChange(prop, 'delete');
          else
            currentSet[prop] = false; // not new
        }

        for (var prop in currentSet) {
          if (currentSet[prop])
            this.notifyPropertySetChange(prop, 'add');

          currentSet[prop] = true;
        }

        this.lastPropertySet = currentSet;
      }
    },

    notifyValueObservers: function() {
      if (this.lastValues) {
        for (var prop in this.lastValues) {
          var newValue = this.target[prop];
          var oldValue = this.lastValues[prop];
          if (newValue !== oldValue)
            this.notifyValueChange(prop, newValue, oldValue);
        }
      }
    },

    notifyPropertySetChange: function(name, type) {
      this.notifyChange({
        propertyName: name,
        mutation: type
      }, this.propertySetObservers);
    },

    notifyValueChange: function(name, value, oldValue) {
      this.notifyChange({
        propertyName: name,
        mutation: 'valueChange',
        oldValue: Model.get(oldValue),
        value: Model.get(value)
      }, this.valueObservers[name]);
    },

    notifyChange: function(change, observers) {
      if (!observers || !observers.length)
        return;
      change.model = this.target;

      observers.concat().forEach(function(callback) {
        callback(change);
      });
    }
  };

  function createTracker(model) {
    if (model instanceof Array)
      return new ArrayTracker(model);

    return new ObjectTracker(model);
  }

  function ArrayTracker(target) {
    this.target = target;
    this.copy = target.concat();
    this.virtualLength = this.copy.length;
  }

  // Only exposed for testing.
  this.ArrayTracker = ArrayTracker;

  ArrayTracker.prototype = createObject({
    __proto__: ObjectTracker.prototype,

    addMutation: function(mutation) {
      if (this.target && mutation.target !== this.target)
        return;
      if (!this.splices)
        this.splices = [];

      var splice;
      if (mutation.mutation == 'set' || mutation.mutation == 'delete') {
        if (!isIndex(mutation.name))
          return;

        var index = +mutation.name;
        if (mutation.mutation == 'delete' && index >= this.virtualLength)
          return;

        splice = newSpliceMutation(index, 1, 1, mutation.target);
      } else {
        splice = newSpliceMutation(mutation.index,
                                   mutation.deleteCount,
                                   mutation.addCount,
                                   mutation.target);
      }

      var range = splice.index + splice.deleteCount;
      var delta = splice.addCount - splice.deleteCount;
      var inserted = false;

      for (var i = 0; i < this.splices.length; i++) {
        var current = this.splices[i];
        var currentRange = current.index + current.addCount;
        var intersectCount = intersect(splice.index,
                                       range,
                                       current.index,
                                       currentRange);

        if (intersectCount >= 0) {
          // Merge the two splices
          splice.index = Math.min(splice.index, current.index);
          splice.deleteCount = splice.deleteCount +
                               current.deleteCount -
                               intersectCount;
          splice.addCount = splice.addCount +
                            current.addCount -
                            intersectCount;
          this.splices.splice(i, 1);
          i--;
        } else if (splice.index <= current.index) {
          current.index += delta;
          if (!inserted) {
            // Insert splice here.
            this.splices.splice(i, 0, splice);
            i++;
            inserted = true;
          }
        }
      }

      if (!inserted)
        this.splices.push(splice);

      this.virtualLength += delta;
    },

    dirtyCheck: function() {
      this.notifyValueObservers();

      while(this.splices.length) {
        var splice = this.splices.shift();
        var spliceArgs = [splice.index, splice.deleteCount];
        var addIndex = splice.index;
        while (addIndex < splice.index + splice.addCount) {
          spliceArgs.push(this.target[addIndex]);
          addIndex++;
        }

        var removed = Array.prototype.splice.apply(this.copy, spliceArgs);
        var added = Array.prototype.slice.call(spliceArgs, 2);
        this.notifySplice(splice.index, removed, added);
      }
    },

    notifySplice: function(index, removed, added) {
      this.notifyChange({
        mutation: 'splice',
        index: index,
        added: added.map(function(item) {
          return Model.get(item);
        }),
        removed: removed.map(function(item) {
          return Model.get(item);
        })
      }, this.propertySetObservers);
    }
  });
})();
