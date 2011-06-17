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

  function isIndex(s) {
    // toUint32: s >>> 0
    return +s === s >>> 0;
  }

  function isObject(obj) {
    return obj === Object(obj);
  }

  var mutationLog = new MutationLog;

  AspectWorkQueue.register(mutationLog, projectMutations);

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
          addNotification(tracker);
        }
      }
    });

    startNotifications();
  }

  var notificationQueue = [];

  function addNotification(tracker) {
    if (!tracker)
      throw Error('Added empty tracker');
    notificationQueue.push(tracker);
  };

  var notificationQueueIsRunning = false;

  function startNotifications() {
    if (notificationQueueIsRunning)
      return;
    notificationQueueIsRunning = true;

    for (var i = 0; i < notificationQueue.length; i++) {
      var tracker = notificationQueue[i];
      if (tracker.dead)
        continue;
      tracker.notify();
    }

    notificationQueue = [];
    notificationQueueIsRunning = false;
  };

  var objectTrackerMap = new WeakMap;

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

  /**
   * Observes the value at a path from an object. |callback| is invoked
   * IFF the value changes.
   * @param {object} data The reference object.
   * @param {Path} path The path from the reference object to monitor a value.
   * @return {*} The current value of the observed path from the object.
   */
  Model.observe = function(data, path, callback) {
    path = new Path(path);

    // If the data is unobservable
    if (!isObject(data))
      throw Error('Invalid path from unobservable data');

    var pathTracker = getModelTracker(data)

    for (var i = 0; i < path.length; i++) {
      pathTracker = pathTracker.getDescendant(path.get(i));
    }

    pathTracker.addObserver(callback);
    return pathTracker.value;
  };

  function createTracker(model) {
    if (model instanceof Array)
      return new ArrayTracker(model);

    return new ObjectTracker(model);
  }

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

  function observePropertyValue(data, name, pathTracker) {
    getModelTracker(data).addValueObserver(name, pathTracker);
  }

  Model.observePropertySet = function(data, callback) {
    if (!isObject(data))
      return;

    getModelTracker(data).addObserver(callback);
  };

  Model.stopObserving = function(data, path, callback) {
   if (!isObject(data))
      return;

    path = new Path(path);
    if (path.length == 0)
      return;

    var model = Object.getObservable(data);

    var tracker = objectTrackerMap.get(model);
    if (!tracker)
      return;

    var pathTracker = tracker;
    for (var i = 0; i < path.length; i++) {
      var propertyName = path.get(i);
      if (!pathTracker.hasDescendant(propertyName))
        return;

      pathTracker = pathTracker.getDescendant(propertyName);
    }

    pathTracker.removeObserver(callback);

    if (!tracker.dependants) {
      objectTrackerMap.delete(model);
      Object.stopObserving(model, mutationLog);
    }
  };

  function stopObservingPropertyValue(data, name, pathTracker) {
    var model = Object.getObservable(data);
    var tracker = objectTrackerMap.get(model);
    if (!tracker)
      return;

    tracker.removeValueObserver(name, pathTracker);
    if (!tracker.dependants) {
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

    tracker.removeObserver(callback);
    if (!tracker.dependants) {
      objectTrackerMap.delete(model);
      Object.stopObserving(model, mutationLog);
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

  function ValueTracker() {}

  ValueTracker.prototype = {
    dependants_: 0,

    // notify: function() {} -- Abstract.

    set hasDependants(hasDependants) {},

    set dependants(dependants) {
      var hadDependants = !!this.dependants_;
      var hasDependants = dependants;
      this.dependants_ = dependants;

      if (hasDependants != hadDependants)
        this.hasDependants = hasDependants;
    },

    get dependants() { return this.dependants_; },

    initObservationState: function() {},
    clearObservationState: function() {},

    addObserver: function(callback) {
      if (!this.observers) {
        this.observers = [callback];
        this.initObservationState();
        return;
      }

      var index = this.observers.indexOf(callback);
      if (index >= 0)
        return;

      this.observers.push(callback);
      this.dependants++;
    },

    removeObserver: function(callback) {
      if (!this.observers)
        return;

      var index = this.observers.indexOf(callback);
      if (index < 0)
        return;

      this.observers.splice(index, 1);
      this.dependants--;
      if (this.observers.length == 0) {
        this.observers = undefined;
        this.clearObservationState();
      }
    },

    notifyObservers: function() {
      if (!this.observers)
        return;
      var args = arguments;
      this.observers.concat().forEach(function(callback) {
        try {
          callback.apply(undefined, args);
        } catch (ex) {
          console.error('Exception during Model mutation notification:', ex);
        }
      });
    },

    getDescendant: function(name) {
      if (!this.descendants)
        this.descendants = {};

      if (this.descendants[name])
        return this.descendants[name];

      var tracker = new PathTracker(this, name);
      this.addDescendant(name, tracker);
      return tracker;
    },

    addDescendant: function(name, tracker) {
      this.descendants[name] = tracker;
      this.dependants++;
    },

    removeDescendant: function(name) {
      delete this.descendants[name];
      this.dependants--;
    },

    hasDescendant: function(name) {
      return this.descendants && this.descendants[name];
    }
  }

  function PathTracker(root, propertyName) {
    this.propertyName = propertyName;
    this.setRoot(root); // Sets up the observer and initial value
  }

  PathTracker.prototype = createObject({
    __proto__: ValueTracker.prototype,

    setRoot: function(root) {
      if (this.observing) {
        stopObservingPropertyValue(this.observing, this.propertyName, this);
        this.observing = undefined;
      }

      this.root = root;

      var newValue = undefined;
      if (isObject(root.value)) {
        this.observing = root.value;
        observePropertyValue(this.observing, this.propertyName, this);
        newValue = this.observing[this.propertyName];
      }

      this.dirtyCheck(newValue);
    },

    dirtyCheck: function(newValue) {
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
      if (this.observers && this.value !== this.lastValue) {
        var oldValue = this.lastValue;
        this.lastValue = this.value;
        exception = this.notifyObservers(this.value, oldValue);
      }

      // Schedule descendants to notify
      if (this.descendants) {
        var keys = Object.keys(this.descendants);
        for (var i = 0; i < keys.length; i++) {
          addNotification(this.descendants[keys[i]]);
        }
      }
    },

    dirtyCheckAndNotify: function(newValue) {
      if (this.dead)
        throw Error('dirtyCheckAndNotify callback received at dead tracker');

      // dirtyCheck will allow all descendants to dirtyCheck. Notifications
      // are scheduled.
      if (this.dirtyCheck(newValue))
        addNotification(this);
    },

    initObservationState: function() {
      this.lastValue = this.value;
    },

    clearObservationState: function() {
      this.lastValue = undefined;
    },

    set hasDependants(hasDependants) {
      if (hasDependants)
        return;

      if (this.observing) {
        stopObservingPropertyValue(this.observing,
                                   this.propertyName,
                                   this);
        this.observing = null;
      }

      this.root.removeDescendant(this.propertyName);

      this.value = undefined;
      this.root = undefined;
      this.propertyName = undefined;
      this.dead = true;
    }
  });

  function ObjectTracker(model) {
    this.target = model;
  }

  ObjectTracker.prototype = createObject({
    __proto__: ValueTracker.prototype,

    addMutation: function(mutation) {}, // noop for object

    get value() {
      return this.target;
    },

    initObservationState: function() {
      this.lastPropertySet = createPropertySet(this.target);
    },

    clearObservationState: function() {
      this.lastPropertySet = undefined;
    },

    addValueObserver: function(name, observer) {
      if (!this.valueObservers)
        this.valueObservers = {};

      var observers = this.valueObservers[name];
      if (!observers) {
        observers = [];
        this.valueObservers[name] = observers;
      }

      var index = observers.indexOf(observer);
      if (index < 0) {
        observers.push(observer);
        this.dependants++;
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
      this.dependants--;
      if (observers.length == 0)
        delete this.valueObservers[name];
    },

    notifyValueObservers: function() {
      if (this.valueObservers) {
        for (var prop in this.valueObservers) {
          var newValue = this.target[prop];
          this.valueObservers[prop].forEach(function(pathTracker) {
            pathTracker.dirtyCheckAndNotify(newValue);
          });
        }
      }
    },

    notify: function() {
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

    notifyPropertySetChange: function(name, type) {
      return this.notifyObservers({
        propertyName: name,
        mutation: type,
        model: this.target
      });
    },
  });

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

    notify: function() {
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
      this.notifyObservers({
        mutation: 'splice',
        index: index,
        added: added.map(function(item) {
          return Model.get(item);
        }),
        removed: removed.map(function(item) {
          return Model.get(item);
        })
      });
    }
  });
})();
